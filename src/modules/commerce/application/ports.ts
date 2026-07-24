// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase B-1(commerceモジュール、PR2)。
// commerceモジュールのRepositoryインターフェース(ポート)。application層はこの
// インターフェースのみに依存し、Supabase等のインフラ詳細を知らない。
//
// 最小リスク方針(entitlementsモジュールPR1と同じ): claim_purchase_grant_step()・
// apply_purchase_balance_grant()・record_purchase_agent_sale()(いずれもPostgres関数、
// claim・副作用・状態更新を単一トランザクションで実行する)は分割せず、1つのRepository
// メソッド呼び出しとして丸ごとラップする。トランザクション境界を分割すると、バグ修正
// PR1〜PR2で解消した二重付与のリスクが再発するため意図的に分割しない。

export type GrantStepKey =
  | "balance_granted"
  | "plot_completed"
  | "commission_posted"
  | "agent_sale_recorded"
  | "referral_confirmed"
  | "notification_sent";

export type ClaimGrantStepResult = {
  claim_outcome: "claimed" | "already_completed" | "in_progress" | "dead";
  step_row_id: string;
  claim_token: string | null;
};

export type BalanceGrantOutcome = {
  claim_outcome: "claimed" | "already_completed" | "in_progress" | "dead";
  new_balance: number | null;
};

export type AgentSaleOutcome = { claim_outcome: "claimed" | "already_completed" | "in_progress" | "dead" };

export type PurchaseGrantContext = {
  id: string;
  user_id: string;
  item_type: string;
  amount: number;
  amount_received_yen: number | null;
  grant_amount: number;
  plot_id: string | null;
  grant_attempt_count: number | null;
};

// 購入行そのもの(status/grant_status)の読み書き。
export interface PurchaseRepository {
  findGrantContext(purchaseId: string): Promise<PurchaseGrantContext>;
  markCompleted(purchaseId: string): Promise<void>;
  markGrantFailed(purchaseId: string, message: string, previousAttemptCount: number): Promise<void>;
  getMonthlySpentYen(userId: string): Promise<number>;
}

// purchase_grant_stepsの原子的claim・完了・失敗記録(バグ修正PR1・PR2)。
export interface PurchaseGrantStepRepository {
  claimStep(purchaseId: string, stepKey: GrantStepKey): Promise<ClaimGrantStepResult>;
  markStepCompleted(stepRowId: string, claimToken: string | null): Promise<boolean>;
  markStepFailed(stepRowId: string, claimToken: string | null, message: string): Promise<void>;
  applyBalanceGrant(purchaseId: string, userId: string, column: "kokudaka" | "gacha_tickets", delta: number): Promise<BalanceGrantOutcome>;
  recordAgentSale(purchaseId: string, userId: string, itemType: string, amount: number): Promise<AgentSaleOutcome>;
}

// 購入イベント外部副作用のoutbox化(バグ修正PR9)。integration_outbox_events/
// notification_outbox_eventsはintegrationsモジュールが所有するテーブルだが、
// integrationsモジュール自体のPhase B-1対応(IntegrationOutboxRepository)は
// 別PRで扱うため、本PRでは既存のsrc/lib/integration-outbox.tsへの薄いゲートウェイ
// として扱う(将来integrationsモジュールのPhase B-1が完了したら、こちらを
// IntegrationOutboxRepositoryへ置き換える)。
export type OutboxTable = "integration_outbox_events" | "notification_outbox_events";

export interface PurchaseOutboxGateway {
  enqueueEvent(
    table: OutboxTable,
    sourceType: string,
    sourceId: string,
    eventType: string,
    targetSystemKey: string,
    payload: Record<string, unknown>
  ): Promise<string>;
  markSent(table: OutboxTable, id: string): Promise<void>;
  markFailed(table: OutboxTable, id: string, message: string, previousAttemptCount: number): Promise<void>;
}

// 紹介confirm(§4.3.3)向けの最小限のユーザー参照。usersテーブル全体を扱う汎用の
// UserRepositoryはidentityモジュールのPhase B-1対応(別PR)で導入する予定のため、
// 現時点ではcommerceが必要とする1メソッドのみを定義する。
export interface UserRepository {
  findReferralSessionKey(userId: string): Promise<string | null>;
}
