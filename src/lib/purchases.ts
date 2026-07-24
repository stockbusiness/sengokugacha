import { SupabasePurchaseRepository } from "@/modules/commerce/infrastructure/supabase-purchase-repository";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase B-1(commerceモジュール、PR2)。
// 実装本体はsrc/modules/commerce/infrastructure/supabase-purchase-repository.tsへ移設した。
// 既存のimport経路(@/lib/purchases)を変更せずに使い続けられるよう、本ファイルは薄い
// 互換ラッパーとして残す。
export async function getMonthlySpentYen(userId: string): Promise<number> {
  return new SupabasePurchaseRepository().getMonthlySpentYen(userId);
}
