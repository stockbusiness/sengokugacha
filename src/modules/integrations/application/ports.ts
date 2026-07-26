// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase B-1(integrationsモジュール)。
// integrationsモジュールのRepositoryインターフェース(ポート)。application層はこの
// インターフェースのみに依存し、Supabase等のインフラ詳細を知らない。
//
// 最小リスク方針(entitlements/commerceモジュールと同じ): claim_integration_inbox_event()
// (Postgres関数、claim・状態更新を単一トランザクションで実行する)は分割せず、1つの
// Repositoryメソッド呼び出しとして丸ごとラップする。

// --- IntegrationOutboxRepository(integration_outbox_events/notification_outbox_events) ---

export type OutboxTable = "integration_outbox_events" | "notification_outbox_events";

export type OutboxRow = {
  id: string;
  source_type: string;
  source_id: string;
  event_type: string;
  target_system_key: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "failed";
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

export type OutboxDrainClaimOutcome =
  | "claimed"
  | "in_progress"
  | "dead"
  | "already_sent"
  | "not_found"
  | "not_eligible"
  | "not_due";

export interface IntegrationOutboxRepository {
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
  listPendingOrFailed(table: OutboxTable): Promise<OutboxRow[]>;
  // 千ノ国パスポート Phase C-0 PR4(§8.2)。管理画面drain専用の原子的claim(fencing token)。
  // 2並列drainで同じ行を二重送信しないようにするため、送信前にこれで行をclaimする
  // (20260809000008)。enqueueEvent直後の即時送信フロー(confirmReferralForPurchase等)は
  // 既存のmarkSent/markFailedをそのまま使い続け、このclaim経路は使わない。
  claimForDrain(table: OutboxTable, id: string, claimToken: string): Promise<OutboxDrainClaimOutcome>;
  markDrainSent(table: OutboxTable, id: string, claimToken: string): Promise<boolean>;
  markDrainFailed(table: OutboxTable, id: string, claimToken: string, message: string): Promise<boolean>;
}

// --- IntegrationInboxRepository(integration_inbox_events) ---

export type InboxClaimResult =
  | { outcome: "new"; inboxEventId: string; claimToken: string }
  | { outcome: "duplicate"; inboxEventId: string }
  | { outcome: "conflict"; inboxEventId: string }
  | { outcome: "in_progress"; inboxEventId: string }
  | { outcome: "dead"; inboxEventId: string };

export interface IntegrationInboxRepository {
  claimEvent(input: {
    sourceSystemKey: string;
    eventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    payloadHash: string;
    eventVersion: string;
  }): Promise<InboxClaimResult>;
  // claim_token(fencing token)が一致し、かつまだprocessing中の場合のみ更新する。
  // falseはlease切れ後に別workerへ再claimされた古いworkerからの呼び出しを示す。
  markSucceeded(inboxEventId: string, claimToken: string): Promise<boolean>;
  markFailed(inboxEventId: string, claimToken: string, message: string): Promise<boolean>;
}

// --- SenNoKuniHubSettingsRepository(sen_no_kuni_hub_settings/sen_no_kuni_hub_used_nonces) ---

export type SenNoKuniHubSettingsRow = {
  system_key: string;
  hmac_secret: string;
  enabled: boolean;
  v1_disabled_at: string | null;
};

export interface SenNoKuniHubSettingsRepository {
  findByKeyId(keyId: string): Promise<SenNoKuniHubSettingsRow | null>;
  // nonceのワンタイム利用チェック。既に使用済み(unique制約違反)ならfalseを返す。
  insertNonceIfUnused(keyId: string, nonce: string): Promise<boolean>;
  // v1利用ログの記録(ベストエフォート。失敗しても呼び出し元には伝播しない)。
  recordV1Usage(keyId: string): Promise<void>;
}

// --- AgencyEventRepository(agency-events.ts: common_user.merged / assigned_agent.updated) ---

export interface AgencyEventRepository {
  findUserIdByCommonUserId(commonUserId: string): Promise<string | null>;
  updateUserCommonUserId(userId: string, targetCommonUserId: string, syncedAtIso: string): Promise<void>;
  recordUnresolvedCommonUserMerge(
    sourceCommonUserId: string,
    targetCommonUserId: string,
    reason: "source_user_not_found",
    payload: Record<string, unknown>
  ): Promise<void>;
  markUnresolvedCommonUserMergeResolved(sourceCommonUserId: string, targetCommonUserId: string): Promise<void>;
  // 同一組み合わせの重複記録(unique制約違反)は冪等として扱い、例外を投げない。
  insertCommonUserMergeConflict(
    sourceCommonUserId: string,
    targetCommonUserId: string,
    sourceUserId: string,
    conflictingTargetUserId: string,
    payload: Record<string, unknown>
  ): Promise<void>;
  recordUnresolvedAgentAssignment(
    commonUserId: string,
    reason: "agent_code_undetermined" | "agent_not_found" | "user_not_found",
    payload: Record<string, unknown>
  ): Promise<void>;
  clearUnresolvedAgentAssignment(commonUserId: string): Promise<void>;
  updateUserAssignedAgent(userId: string, agentId: string | null): Promise<void>;
  findAgentIdByExternalId(agentCode: string): Promise<string | null>;
}
