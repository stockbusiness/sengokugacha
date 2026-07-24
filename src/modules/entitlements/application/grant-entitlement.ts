import type { EntitlementRepository, ProcessEntitlementGrantResult } from "@/modules/entitlements/application/ports";
import { revokeEntitlement } from "@/modules/entitlements/application/revoke-entitlement";

// P0-2(§4.3)。entitlement_id自体は記録済みでも残高反映(application_status)が
// 'applied'でなければ再試行する(既存実装ではentitlement_id重複時に即returnしていたため、
// 残高反映が一度も成功しないまま再送を受けても永久に復旧できないバグ#3があった)。
// entitlement_idの一意性はsource_system_key単位(§6.2)。source_system_keyはHMAC認証済みの
// identity.systemKeyを正とし、未検証のリクエスト本文(body.source_system_key)は使わない(バグ#6)。
export async function grantEntitlement(
  repository: EntitlementRepository,
  body: Record<string, unknown>,
  systemKey: string
): Promise<void> {
  const entitlementId = typeof body.entitlement_id === "string" ? body.entitlement_id : null;
  const commonUserId = typeof body.common_user_id === "string" ? body.common_user_id : null;
  const entitlementType = typeof body.entitlement_type === "string" ? body.entitlement_type : "generic";
  if (!entitlementId || !commonUserId) {
    throw new Error("entitlement_id/common_user_idが不足しています");
  }

  const existing = await repository.findBySourceAndEntitlementId(systemKey, entitlementId);

  const row = existing
    ? existing
    : await repository.createOrGetExisting({
        entitlementId,
        commonUserId,
        userId: await repository.resolveLocalUserId(commonUserId),
        entitlementType,
        productCode: typeof body.product_code === "string" ? body.product_code : null,
        quantity: typeof body.quantity === "number" && body.quantity > 0 ? body.quantity : 1,
        validFrom: typeof body.valid_from === "string" ? body.valid_from : null,
        validUntil: typeof body.valid_until === "string" ? body.valid_until : null,
        orderId: typeof body.order_id === "string" ? body.order_id : null,
        orderItemId: typeof body.order_item_id === "string" ? body.order_item_id : null,
        sourceSystemKey: systemKey,
        metadata: body.metadata ?? null,
      });

  // process_entitlement_grant()(Postgres関数、マイグレーション20260808000003)が
  // claim検証・user_id再解決・残高加算・application_status更新を単一トランザクションで
  // 実行するため、途中でプロセスが落ちても二重付与は起こらない。
  const grantResult = await repository.processGrant(row.id);

  if (grantResult.claim_outcome === "dead") {
    throw new Error(`entitlement付与は再試行の上限に達しています(entitlement_id=${entitlementId})`);
  }
  if (grantResult.claim_outcome === "in_progress") {
    throw new Error(`entitlement付与は他のリクエストが処理中です(entitlement_id=${entitlementId})`);
  }
  if (grantResult.claim_outcome === "user_unresolved") {
    // common_user_idが未解決のユーザーには残高を反映できない。application_statusは
    // not_appliedのまま保持され、後日common_user_id解決が進んだ時点で再送/手動再解決する。
    console.warn(`[entitlements] user_id未解決のため${entitlementType}付与を保留しました(entitlement_id=${entitlementId})`);
  }

  // 千ノ国パスポート次期改修指示書 P0-2(§4.4)。entitlement.revokedがentitlement.grantedより
  // 先に届いていた場合、grant確定直後にその取消を適用する(順序逆転対応)。
  const pending = await repository.findPendingRevocation(systemKey, entitlementId);
  if (pending) {
    await revokeEntitlement(repository, pending.payload, systemKey);
    await repository.deletePendingRevocation(pending.id);
  }
}

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書§5.5後半。
// 管理画面(未解決entitlement一覧)からの手動再解決トリガー用。process_entitlement_grant()を
// 直接呼び出し、common_user_idに対応するローカルユーザーの同期が進んでいれば残高付与まで
// 完了させる(grantEntitlement()と異なり、entitlement行の新規作成・保留取消の適用は
// 行わない。既に存在する行の再解決のみを対象とする)。
export async function retryResolveEntitlementGrant(
  repository: EntitlementRepository,
  entitlementRowId: string
): Promise<ProcessEntitlementGrantResult> {
  return repository.processGrant(entitlementRowId);
}
