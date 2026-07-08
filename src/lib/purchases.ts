import { createSupabaseServerClient } from "@/lib/supabase-server";

// 使いすぎ防止(payment_settings.monthly_spending_cap_yen)の判定に使う、
// 当月(サーバーのローカル日付基準)の完了済み購入金額の合計。
export async function getMonthlySpentYen(userId: string): Promise<number> {
  const supabase = createSupabaseServerClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data, error } = await supabase
    .from("purchases")
    .select("amount")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("created_at", startOfMonth.toISOString());

  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + row.amount, 0);
}
