import type {
  WalletAdapter,
  WalletGrantRequest,
  WalletGrantResult,
  WalletReverseRequest,
  WalletReverseResult,
} from "@/modules/learning-journey/domain/wallet-contract";

// 「はじまりの旅」PR5-a。Fake Walletアダプタ。
//
// PR5-aで存在する唯一の実装。HTTPは一切使わない。Wallet側の冪等性と各種失敗を
// メモリ上で再現し、状態機械・claim/fencing・再送の検証に使う。
//
// 「応答喪失」を再現できることが重要。内部では取引を作るが呼び出し側にはエラーを返す、
// という挙動が無いと、二重付与が起きない保証をテストで示せない。

export type FakeScenario =
  | { kind: "success" }
  | { kind: "transient"; code?: string }
  | { kind: "permanent"; code?: string }
  | { kind: "auth"; code?: string }
  | { kind: "limit"; code?: string }
  | { kind: "timeout" }
  // 取引は作るが、呼び出し側にはエラーを返す。再送で同じ取引へ収束することを確かめる。
  | { kind: "lost_response" };

type StoredTransaction = {
  transactionId: string;
  amount: number;
  externalUserId: string;
  serviceCode: string;
};

export class FakeWalletAdapter implements WalletAdapter {
  // idempotencyKey -> 取引。Wallet側の冪等性を模す。
  private readonly grants = new Map<string, StoredTransaction>();
  private readonly reversals = new Map<string, string>();
  // 取消済みの元取引ID。二重取消の検出用。
  private readonly reversedOriginals = new Set<string>();

  private nextScenario: FakeScenario = { kind: "success" };
  private sequence = 0;

  grantCallCount = 0;
  reverseCallCount = 0;

  // 次の1回の挙動を指定する。指定しなければ成功。
  setScenario(scenario: FakeScenario): void {
    this.nextScenario = scenario;
  }

  // 内部に実際に作られた取引の数。二重付与が起きていないことの確認に使う。
  get transactionCount(): number {
    return this.grants.size;
  }

  get reversalCount(): number {
    return this.reversals.size;
  }

  private takeScenario(): FakeScenario {
    const scenario = this.nextScenario;
    this.nextScenario = { kind: "success" };
    return scenario;
  }

  private newTransactionId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  async grant(request: WalletGrantRequest): Promise<WalletGrantResult> {
    this.grantCallCount += 1;
    const scenario = this.takeScenario();

    // 冪等性は失敗シナリオより先に判定する。実際のWalletも、既存取引があれば
    // それを返すのが先で、その後の処理で失敗することはない。
    const existing = this.grants.get(request.idempotencyKey);
    if (existing) {
      // 同一キーで金額が違うのは契約違反。新規取引を作らずに拒否する。
      if (existing.amount !== request.amount) {
        return {
          ok: false,
          failure: {
            kind: "permanent",
            code: "conflict",
            message: "同一のidempotency_keyで異なる金額が送信されました",
            requestId: null,
          },
        };
      }
      return { ok: true, transactionId: existing.transactionId, requestId: null };
    }

    switch (scenario.kind) {
      case "timeout":
        throw new Error("wallet request timed out");
      case "transient":
        return this.failure("transient", scenario.code ?? "server_error", "一時的な障害です");
      case "permanent":
        return this.failure("permanent", scenario.code ?? "bad_request", "リクエストが不正です");
      case "auth":
        return this.failure("auth", scenario.code ?? "unauthorized", "認証に失敗しました");
      case "limit":
        return this.failure("limit", scenario.code ?? "limit_exceeded", "付与上限に達しました");
      case "lost_response": {
        // 取引は作る。だが呼び出し側は失敗として受け取る。
        this.grants.set(request.idempotencyKey, {
          transactionId: this.newTransactionId("tx"),
          amount: request.amount,
          externalUserId: request.user.externalUserId,
          serviceCode: request.user.serviceCode,
        });
        return this.failure("transient", "response_lost", "応答が失われました");
      }
      case "success": {
        const transactionId = this.newTransactionId("tx");
        this.grants.set(request.idempotencyKey, {
          transactionId,
          amount: request.amount,
          externalUserId: request.user.externalUserId,
          serviceCode: request.user.serviceCode,
        });
        return { ok: true, transactionId, requestId: `req-${this.sequence}` };
      }
    }
  }

  async reverse(request: WalletReverseRequest): Promise<WalletReverseResult> {
    this.reverseCallCount += 1;
    const scenario = this.takeScenario();

    const existing = this.reversals.get(request.idempotencyKey);
    if (existing) {
      return { ok: true, reversalTransactionId: existing, requestId: null };
    }

    if (scenario.kind !== "success") {
      const failure = await this.grantFailureFor(scenario);
      if (failure) return failure;
    }

    // 元取引を二重に取り消さない。
    if (this.reversedOriginals.has(request.originalTransactionId)) {
      return {
        ok: false,
        failure: {
          kind: "permanent",
          code: "already_reversed",
          message: "元取引は既に取り消されています",
          requestId: null,
        },
      };
    }

    const reversalTransactionId = this.newTransactionId("rev");
    this.reversals.set(request.idempotencyKey, reversalTransactionId);
    this.reversedOriginals.add(request.originalTransactionId);
    return { ok: true, reversalTransactionId, requestId: `req-${this.sequence}` };
  }

  private failure(
    kind: "transient" | "permanent" | "auth" | "limit",
    code: string,
    message: string
  ): WalletGrantResult {
    return { ok: false, failure: { kind, code, message, requestId: null } };
  }

  private async grantFailureFor(scenario: FakeScenario): Promise<WalletReverseResult | null> {
    switch (scenario.kind) {
      case "timeout":
        throw new Error("wallet request timed out");
      case "transient":
      case "permanent":
      case "auth":
      case "limit":
        return {
          ok: false,
          failure: { kind: scenario.kind, code: scenario.code ?? scenario.kind, message: "失敗", requestId: null },
        };
      default:
        return null;
    }
  }
}
