import { createSupabaseServerClient } from "@/lib/supabase-server";

// 今日を含め、login_logs に連続して記録がある日数を返す(未ログイン日があった時点で打ち切り)。
export async function getLoginStreak(userId: string): Promise<number> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("login_logs")
    .select("login_date")
    .eq("user_id", userId)
    .order("login_date", { ascending: false })
    .limit(60);

  if (error) throw error;

  const loggedDates = new Set((data ?? []).map((r) => r.login_date as string));

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (loggedDates.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function getStreakBonusDraws(streak: number, bonus7: number, bonus30: number): number {
  if (streak >= 30) return bonus30;
  if (streak >= 7) return bonus7;
  return 0;
}
