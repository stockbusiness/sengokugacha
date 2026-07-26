// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase B-1。
// entitlementsモジュールのRepositoryインターフェース(ポート)。application層はこの
// インターフェースのみに依存し、Supabase等のインフラ詳細を知らない。
//
// 最小リスク方針: process_entitlement_grant()/process_entitlement_revocation()は、
// 既存のPostgres関数呼び出し(claim・副作用・状態更新を単一トランザクションで実行する、
// バグ修正PR3で導入)をそのまま1つのRepositoryメソッド呼び出しとして丸ごとラップする。
// ここでトランザクション境界を分割すると、PR3で解消した二重付与・二重取消のリスクが
// 再発するため意図的に分割しない(DB統合テスト基盤が無く、分割した場合の回帰を
// 自動検知できないため)。

export type EntitlementRow = { id: string };

export type ProcessEntitlementGrantResult = {
  claim_outcome:
    | "claimed"
    // grant受信時点で既にstatus='revoked'だった(revoke先行の順序逆転)場合、
    // 同一トランザクション内でgrant適用直後にrevokeまで自動適用したことを示す
    // (マージ前最終修正指示§1)。
    | "claimed_then_reversed"
    // grant自体(残高付与)は成功したが、同一トランザクション内で試みた自動取消が
    // 完了しなかった(通常は発生しない防御的な分岐)。revoke再送での収束に委ねる。
    | "claimed_reversal_pending"
    | "already_applied"
    | "already_revoked"
    | "user_unresolved"
    | "in_progress"
    | "dead"
    | "not_found"
    // 管理者が「再解決を試みても解消しない」と却下済み(resolution_dismissed_at設定済み)。
    | "dismissed";
  resolved_user_id: string | null;
};

export type ProcessEntitlementRevocationResult = {
  claim_outcome: "claimed" | "already_reversed" | "reversed_without_balance_change" | "in_progress" | "dead" | "not_found";
};

export type CreateEntitlementInput = {
  entitlementId: string;
  commonUserId: string;
  userId: string | null;
  entitlementType: string;
  productCode: string | null;
  quantity: number;
  validFrom: string | null;
  validUntil: string | null;
  orderId: string | null;
  orderItemId: string | null;
  sourceSystemKey: string;
  metadata: unknown;
};

export type UpdateEntitlementMetadataInput = {
  validFrom?: string;
  validUntil?: string;
  metadata?: unknown;
};

export type PendingRevocation = { id: string; payload: Record<string, unknown> };

export interface EntitlementRepository {
  findBySourceAndEntitlementId(sourceSystemKey: string, entitlementId: string): Promise<EntitlementRow | null>;
  resolveLocalUserId(commonUserId: string): Promise<string | null>;
  // 既存行が無ければ作成し、一意制約違反(並行実行との競合)時は既存行を取得し直して返す。
  createOrGetExisting(input: CreateEntitlementInput): Promise<EntitlementRow>;
  updateMetadata(sourceSystemKey: string, entitlementId: string, fields: UpdateEntitlementMetadataInput): Promise<void>;
  processGrant(entitlementRowId: string): Promise<ProcessEntitlementGrantResult>;
  processRevocation(entitlementRowId: string): Promise<ProcessEntitlementRevocationResult>;
  findPendingRevocation(sourceSystemKey: string, entitlementId: string): Promise<PendingRevocation | null>;
  upsertPendingRevocation(sourceSystemKey: string, entitlementId: string, payload: Record<string, unknown>): Promise<void>;
  deletePendingRevocation(id: string): Promise<void>;
}
