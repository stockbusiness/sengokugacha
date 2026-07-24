import { adjustUserBalance } from "@/lib/atomic-balance";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type ActivityType = "gacha_draw" | "academy_view" | "market_view" | "event_view" | "login";

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  gacha_draw: "武将登用",
  academy_view: "AI寺子屋受講",
  market_view: "市場閲覧",
  event_view: "イベント参加",
  login: "ログイン",
};

// Ver2.3指示書1章の取得例に対応する固定ポイント(武将登用のみレアリティに応じて可変)。
export const MANUAL_ACTIVITY_POINTS: Record<Exclude<ActivityType, "gacha_draw">, number> = {
  academy_view: 30,
  market_view: 5,
  event_view: 20,
  login: 2,
};

// 活動ログへの記録と users.contribution_points(総国家貢献)への加算をまとめて行う。
// 呼び出し側(daily-missions.ts / passport.ts)は必ずこの関数経由でポイントを付与する
// (集計元を一本化し、活動ログと総国家貢献の値がずれないようにするため)。
// gacha_draw(武将登用)のみ例外で、execute_gacha_draw()(マイグレーション20260808000006)が
// 同一トランザクション内でuser_activity挿入+残高加算を直接行うため、この関数を経由しない
// (モジュール化後バグ修正Phase A-4 §8、ガチャ全体を単一トランザクションにするための設計)。
export async function recordContribution(userId: string, activityType: ActivityType, point: number): Promise<void> {
  const supabase = createSupabaseServerClient();

  const { error: activityError } = await supabase
    .from("user_activity")
    .insert({ user_id: userId, activity_type: activityType, point });
  if (activityError) throw activityError;

  // 原子的なDB関数で加算する(read-modify-write競合の解消。全体統合対応 実装計画PR2)。
  await adjustUserBalance(userId, "contribution_points", point);
}

export type ContributionSummary = { total: number; thisMonth: number; today: number };

export async function getContributionSummary(userId: string): Promise<ContributionSummary> {
  const supabase = createSupabaseServerClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    { data: user, error: userError },
    { data: monthRows, error: monthError },
    { data: todayRows, error: todayError },
  ] = await Promise.all([
    supabase.from("users").select("contribution_points").eq("id", userId).single(),
    supabase.from("user_activity").select("point").eq("user_id", userId).gte("created_at", monthStart),
    supabase.from("user_activity").select("point").eq("user_id", userId).gte("created_at", todayStart),
  ]);
  if (userError) throw userError;
  if (monthError) throw monthError;
  if (todayError) throw todayError;

  return {
    total: user.contribution_points,
    thisMonth: (monthRows ?? []).reduce((sum, row) => sum + row.point, 0),
    today: (todayRows ?? []).reduce((sum, row) => sum + row.point, 0),
  };
}

export type ActivityLogEntry = {
  id: string;
  activityType: ActivityType;
  label: string;
  point: number;
  createdAt: string;
};

export async function getRecentActivity(userId: string, limit = 20): Promise<ActivityLogEntry[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_activity")
    .select("id, activity_type, point, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((row) => {
    const activityType = row.activity_type as ActivityType;
    return {
      id: row.id,
      activityType,
      label: ACTIVITY_LABELS[activityType] ?? row.activity_type,
      point: row.point,
      createdAt: row.created_at,
    };
  });
}

export async function getAcademyActivityCount(userId: string): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { count, error } = await supabase
    .from("user_activity")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("activity_type", "academy_view");
  if (error) throw error;
  return count ?? 0;
}
