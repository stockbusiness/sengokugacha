import { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート 全体統合対応 実装計画(PR1)。
// kokudaka/gacha_tickets/contribution_pointsのread-modify-write競合を解消するため、
// Postgres関数(adjust_user_balance/consume_gacha_ticket、マイグレーション
// 20260803000001で定義)経由で原子的に更新する薄いラッパー。

export type UserBalanceColumn = "kokudaka" | "gacha_tickets" | "contribution_points";

// 付与・返金取消の両方で使う。0未満にはならない(DB関数側でgreatest(0, ...)を適用)。
export async function adjustUserBalance(userId: string, column: UserBalanceColumn, delta: number): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("adjust_user_balance", {
    p_user_id: userId,
    p_column: column,
    p_delta: delta,
  });
  if (error) throw error;
  return data as number;
}

// ガチャ券消費専用。残高不足時はDB関数がinsufficient_gacha_ticketsを送出する。
// 呼び出し側(src/lib/gacha.ts)で既存のInsufficientTicketsErrorへ変換すること。
export async function consumeGachaTicket(userId: string): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("consume_gacha_ticket", { p_user_id: userId });
  if (error) {
    if (error.message?.includes("insufficient_gacha_tickets")) {
      throw new Error("insufficient_gacha_tickets");
    }
    throw error;
  }
  return data as number;
}
