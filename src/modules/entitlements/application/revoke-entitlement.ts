import type { EntitlementRepository } from "@/modules/entitlements/application/ports";

// P0-2(§4.3・4.4)。statusの更新順序に関わらず、実際に残高が反映されていた場合のみ
// 取消(減算)を行う(既存実装ではstatus='revoked'を先に更新していたため、減算が失敗すると
// 冪等チェック(status==='revoked')に阻まれ再試行できなくなるバグ#4があった)。
// 対象のentitlementがまだ存在しない場合(grantより先にrevokeが届いた順序逆転)は、
// 保留取消として保存し、grant到着時に適用する。
export async function revokeEntitlement(
  repository: EntitlementRepository,
  body: Record<string, unknown>,
  systemKey: string
): Promise<void> {
  const entitlementId = typeof body.entitlement_id === "string" ? body.entitlement_id : null;
  if (!entitlementId) throw new Error("entitlement_idが不足しています");

  const entitlement = await repository.findBySourceAndEntitlementId(systemKey, entitlementId);

  if (!entitlement) {
    await repository.upsertPendingRevocation(systemKey, entitlementId, body);
    return;
  }

  // process_entitlement_revocation()(Postgres関数、マイグレーション20260808000003)が
  // claim検証・残高減算・reversal_status更新を単一トランザクションで実行するため、
  // 途中でプロセスが落ちても二重取消は起こらない。
  const revokeResult = await repository.processRevocation(entitlement.id);

  if (revokeResult.claim_outcome === "dead") {
    throw new Error(`entitlement取消は再試行の上限に達しています(entitlement_id=${entitlementId})`);
  }
  if (revokeResult.claim_outcome === "in_progress") {
    throw new Error(`entitlement取消は他のリクエストが処理中です(entitlement_id=${entitlementId})`);
  }
}
