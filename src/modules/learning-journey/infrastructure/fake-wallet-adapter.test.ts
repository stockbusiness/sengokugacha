import { beforeEach, describe, expect, it } from "vitest";
import { FakeWalletAdapter } from "./fake-wallet-adapter";
import { buildRewardIdempotencyKey } from "@/modules/learning-journey/domain/reward-idempotency";
import type { WalletGrantRequest } from "@/modules/learning-journey/domain/wallet-contract";

function grantRequest(overrides: Partial<WalletGrantRequest> = {}): WalletGrantRequest {
  return {
    idempotencyKey: buildRewardIdempotencyKey("ce-1"),
    user: { kind: "external_user_id", serviceCode: "passport", externalUserId: "eu-1" },
    amount: 300,
    transactionType: "LEARNING_JOURNEY_REWARD",
    ruleCode: "SENGOKU_LEARNING_JOURNEY_REWARD",
    ...overrides,
  };
}

let wallet: FakeWalletAdapter;

beforeEach(() => {
  wallet = new FakeWalletAdapter();
});

describe("冪等性", () => {
  // Wallet側の受入条件「同一idempotency_keyを10回送信 → 取引は1件、全応答が同じ取引IDへ収束」。
  it("同一キーを10回送っても取引は1件で、応答は同じ取引IDに収束する", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      const result = await wallet.grant(grantRequest());
      expect(result.ok).toBe(true);
      if (result.ok) ids.add(result.transactionId);
    }
    expect(ids.size).toBe(1);
    expect(wallet.transactionCount).toBe(1);
    expect(wallet.grantCallCount).toBe(10);
  });

  it("キーが違えば別の取引になる", async () => {
    await wallet.grant(grantRequest({ idempotencyKey: buildRewardIdempotencyKey("ce-1") }));
    await wallet.grant(grantRequest({ idempotencyKey: buildRewardIdempotencyKey("ce-2") }));
    expect(wallet.transactionCount).toBe(2);
  });

  // 「同一キー・異なる金額 → 拒否し、新規取引を作らない」。
  it("同一キーで金額が違えば拒否し、新規取引を作らない", async () => {
    await wallet.grant(grantRequest({ amount: 300 }));
    const result = await wallet.grant(grantRequest({ amount: 500 }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.kind).toBe("permanent");
    expect(result.ok === false && result.failure.code).toBe("conflict");
    expect(wallet.transactionCount).toBe(1);
  });
});

describe("失敗シナリオ", () => {
  it.each([
    ["transient", "transient"],
    ["permanent", "permanent"],
    ["auth", "auth"],
    ["limit", "limit"],
  ] as const)("%s を再現できる", async (scenario, expectedKind) => {
    wallet.setScenario({ kind: scenario });
    const result = await wallet.grant(grantRequest());
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.kind).toBe(expectedKind);
    // 失敗時は取引を作らない。
    expect(wallet.transactionCount).toBe(0);
  });

  it("タイムアウトは例外として投げる", async () => {
    wallet.setScenario({ kind: "timeout" });
    await expect(wallet.grant(grantRequest())).rejects.toThrow(/timed out/);
    expect(wallet.transactionCount).toBe(0);
  });

  it("シナリオは1回だけ効き、次は成功に戻る", async () => {
    wallet.setScenario({ kind: "transient" });
    expect((await wallet.grant(grantRequest({ idempotencyKey: "k1" }))).ok).toBe(false);
    expect((await wallet.grant(grantRequest({ idempotencyKey: "k2" }))).ok).toBe(true);
  });
});

describe("応答喪失", () => {
  // これが再現できないと、二重付与が起きない保証をテストで示せない。
  it("応答喪失時、内部では取引が作られている", async () => {
    wallet.setScenario({ kind: "lost_response" });
    const result = await wallet.grant(grantRequest());

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.code).toBe("response_lost");
    // 呼び出し側は失敗と受け取るが、Wallet側には取引がある。
    expect(wallet.transactionCount).toBe(1);
  });

  it("応答喪失のあと同じキーで再送しても、取引は1件のまま", async () => {
    wallet.setScenario({ kind: "lost_response" });
    await wallet.grant(grantRequest());

    const retry = await wallet.grant(grantRequest());

    expect(retry.ok).toBe(true);
    expect(wallet.transactionCount).toBe(1);
  });

  it("応答喪失のあと10回再送しても二重付与にならない", async () => {
    wallet.setScenario({ kind: "lost_response" });
    await wallet.grant(grantRequest());

    const ids = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      const result = await wallet.grant(grantRequest());
      if (result.ok) ids.add(result.transactionId);
    }

    expect(ids.size).toBe(1);
    expect(wallet.transactionCount).toBe(1);
  });
});

describe("取消", () => {
  async function grantThenReverse() {
    const granted = await wallet.grant(grantRequest());
    if (!granted.ok) throw new Error("付与に失敗した");
    return granted.transactionId;
  }

  // Wallet側の受入条件「取消を10回送信 → 取消は1件、元付与を1回だけ相殺」。
  it("同一キーで10回取消しても取消は1件", async () => {
    const originalTransactionId = await grantThenReverse();

    const ids = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      const result = await wallet.reverse({
        idempotencyKey: "learning_journey_reversal:rr-1:ap-1",
        originalTransactionId,
        reason: "管理者承認済みの取消",
      });
      expect(result.ok).toBe(true);
      if (result.ok) ids.add(result.reversalTransactionId);
    }

    expect(ids.size).toBe(1);
    expect(wallet.reversalCount).toBe(1);
  });

  // 別の承認レコードでも、元取引は二重に取り消されない。
  it("別キーでも同じ元取引を二重取消しない", async () => {
    const originalTransactionId = await grantThenReverse();

    await wallet.reverse({
      idempotencyKey: "learning_journey_reversal:rr-1:ap-1",
      originalTransactionId,
      reason: "1回目",
    });
    const second = await wallet.reverse({
      idempotencyKey: "learning_journey_reversal:rr-1:ap-2",
      originalTransactionId,
      reason: "2回目",
    });

    expect(second.ok).toBe(false);
    expect(second.ok === false && second.failure.code).toBe("already_reversed");
    expect(wallet.reversalCount).toBe(1);
  });
});
