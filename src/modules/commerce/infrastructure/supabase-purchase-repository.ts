import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { PurchaseGrantContext, PurchaseRepository } from "@/modules/commerce/application/ports";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// PurchaseRepositoryのSupabase実装。既存のsrc/lib/purchase-grants.ts・
// src/lib/purchases.tsに実装されていたものと完全に同じクエリのまま、
// インターフェースの背後へ移設したもの。
export class SupabasePurchaseRepository implements PurchaseRepository {
  private readonly supabase: SupabaseServerClient;

  constructor(supabase: SupabaseServerClient = createSupabaseServerClient()) {
    this.supabase = supabase;
  }

  async findGrantContext(purchaseId: string): Promise<PurchaseGrantContext> {
    const { data, error } = await this.supabase
      .from("purchases")
      .select("id, user_id, item_type, amount, amount_received_yen, grant_amount, plot_id, grant_attempt_count")
      .eq("id", purchaseId)
      .single();
    if (error) throw error;
    return data as PurchaseGrantContext;
  }

  async markCompleted(purchaseId: string): Promise<void> {
    const { error } = await this.supabase
      .from("purchases")
      .update({ status: "completed", grant_status: "granted", granted_at: new Date().toISOString() })
      .eq("id", purchaseId);
    if (error) throw error;
  }

  async markGrantFailed(purchaseId: string, message: string, previousAttemptCount: number): Promise<void> {
    await this.supabase
      .from("purchases")
      .update({
        grant_status: "failed",
        grant_last_error: message,
        grant_attempt_count: previousAttemptCount + 1,
      })
      .eq("id", purchaseId);
  }

  // 使いすぎ防止(payment_settings.monthly_spending_cap_yen)の判定に使う、
  // 当月(サーバーのローカル日付基準)の完了済み購入金額の合計。
  async getMonthlySpentYen(userId: string): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data, error } = await this.supabase
      .from("purchases")
      .select("amount")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("created_at", startOfMonth.toISOString());

    if (error) throw error;
    return (data ?? []).reduce((sum, row) => sum + row.amount, 0);
  }
}
