import { createSupabaseServerClient } from "@/lib/supabase-server";

export type KpiSummary = {
  totalUsers: number;
  newUsersToday: number;
  dau: number;
  wau: number;
  gachaDrawsToday: number;
  purchasesTodayYen: number;
  purchasesMonthYen: number;
};

// 04_mvp_spec 8章のMVP検証目標(毎日ログインされるか/ガチャが回るか)に対応する
// 主要指標を管理画面トップで一目で確認できるようにする。
export async function getKpiSummary(): Promise<KpiSummary> {
  const supabase = createSupabaseServerClient();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOf7DaysAgo = new Date(startOfToday);
  startOf7DaysAgo.setDate(startOf7DaysAgo.getDate() - 6);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayDateStr = startOfToday.toISOString().slice(0, 10);
  const sevenDaysAgoDateStr = startOf7DaysAgo.toISOString().slice(0, 10);

  const [totalUsersRes, newUsersTodayRes, dauRes, wauRes, gachaDrawsTodayRes, purchasesTodayRes, purchasesMonthRes] =
    await Promise.all([
      supabase.from("users").select("id", { count: "exact", head: true }).not("line_user_id", "like", "deleted-%"),
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .not("line_user_id", "like", "deleted-%")
        .gte("created_at", startOfToday.toISOString()),
      supabase.from("login_logs").select("user_id").eq("login_date", todayDateStr),
      supabase.from("login_logs").select("user_id").gte("login_date", sevenDaysAgoDateStr),
      supabase
        .from("gacha_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfToday.toISOString()),
      supabase.from("purchases").select("amount").eq("status", "completed").gte("created_at", startOfToday.toISOString()),
      supabase.from("purchases").select("amount").eq("status", "completed").gte("created_at", startOfMonth.toISOString()),
    ]);

  const firstError = [
    totalUsersRes.error,
    newUsersTodayRes.error,
    dauRes.error,
    wauRes.error,
    gachaDrawsTodayRes.error,
    purchasesTodayRes.error,
    purchasesMonthRes.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  const dau = new Set((dauRes.data ?? []).map((r) => r.user_id)).size;
  const wau = new Set((wauRes.data ?? []).map((r) => r.user_id)).size;
  const purchasesTodayYen = (purchasesTodayRes.data ?? []).reduce((sum, r) => sum + r.amount, 0);
  const purchasesMonthYen = (purchasesMonthRes.data ?? []).reduce((sum, r) => sum + r.amount, 0);

  return {
    totalUsers: totalUsersRes.count ?? 0,
    newUsersToday: newUsersTodayRes.count ?? 0,
    dau,
    wau,
    gachaDrawsToday: gachaDrawsTodayRes.count ?? 0,
    purchasesTodayYen,
    purchasesMonthYen,
  };
}
