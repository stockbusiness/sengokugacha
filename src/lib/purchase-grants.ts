import { runPurchaseGrant as runPurchaseGrantApp } from "@/modules/commerce/application/run-purchase-grant";
import { SupabasePurchaseRepository } from "@/modules/commerce/infrastructure/supabase-purchase-repository";
import { SupabasePurchaseGrantStepRepository } from "@/modules/commerce/infrastructure/supabase-purchase-grant-step-repository";
import { SupabasePurchaseOutboxGateway } from "@/modules/commerce/infrastructure/supabase-purchase-outbox-gateway";
import { SupabaseUserRepository } from "@/modules/commerce/infrastructure/supabase-user-repository";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase B-1(commerceモジュール、PR2)。
// 実装本体はsrc/modules/commerce/へ移設した(application層: src/modules/commerce/application/
// run-purchase-grant.ts、infrastructure層: src/modules/commerce/infrastructure/)。既存のimport経路
// (@/lib/purchase-grants)を変更せずに使い続けられるよう、本ファイルは薄い互換ラッパーとして残す。
// 挙動・SQL/RPC呼び出し・エラーメッセージは移設前と完全に同一(コードの再配置のみ)。
export async function runPurchaseGrant(purchaseId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  await runPurchaseGrantApp(
    new SupabasePurchaseRepository(supabase),
    new SupabasePurchaseGrantStepRepository(supabase),
    new SupabasePurchaseOutboxGateway(supabase),
    new SupabaseUserRepository(supabase),
    purchaseId
  );
}
