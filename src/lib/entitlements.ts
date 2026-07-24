import { grantEntitlement, retryResolveEntitlementGrant as retryResolveEntitlementGrantApp } from "@/modules/entitlements/application/grant-entitlement";
import { revokeEntitlement } from "@/modules/entitlements/application/revoke-entitlement";
import { updateEntitlement } from "@/modules/entitlements/application/update-entitlement";
import type { ProcessEntitlementGrantResult } from "@/modules/entitlements/application/ports";
import { SupabaseEntitlementRepository } from "@/modules/entitlements/infrastructure/supabase-entitlement-repository";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase B-1。
// 実装本体はsrc/modules/entitlements/へ移設した(application層: 付与/取消/更新の
// オーケストレーション、infrastructure層: Supabase呼び出し)。既存のimport経路
// (@/lib/entitlements)を変更せずに使い続けられるよう、本ファイルは薄い互換ラッパーとして残す。
// 挙動・SQL呼び出し・エラーメッセージは移設前と完全に同一(コードの再配置のみ)。

export async function handleEntitlementGranted(body: Record<string, unknown>, systemKey: string): Promise<void> {
  await grantEntitlement(new SupabaseEntitlementRepository(), body, systemKey);
}

export async function handleEntitlementUpdated(body: Record<string, unknown>, systemKey: string): Promise<void> {
  await updateEntitlement(new SupabaseEntitlementRepository(), body, systemKey);
}

export async function handleEntitlementRevoked(body: Record<string, unknown>, systemKey: string): Promise<void> {
  await revokeEntitlement(new SupabaseEntitlementRepository(), body, systemKey);
}

export async function retryResolveEntitlementGrant(entitlementRowId: string): Promise<ProcessEntitlementGrantResult> {
  return retryResolveEntitlementGrantApp(new SupabaseEntitlementRepository(), entitlementRowId);
}
