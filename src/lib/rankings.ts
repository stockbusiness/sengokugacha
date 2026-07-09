import { createSupabaseServerClient } from "@/lib/supabase-server";

export type RankingType = "contribution" | "warlord_collection" | "province_conquest" | "academy";

export const RANKING_TYPE_LABELS: Record<RankingType, string> = {
  contribution: "国家貢献",
  warlord_collection: "武将収集",
  province_conquest: "国盗り",
  academy: "AI活動",
};

export type RankingEntry = { rank: number; displayName: string | null; value: number };

// Ver2.3指示書4章の国家ランキング(表示のみ)。件数の少ない小規模運用を前提に、
// DBビュー/RPCは追加せず、既存テーブルをJS側で集計する(指示書「既存コードを活かした差分実装」)。
export async function getContributionRanking(limit = 20): Promise<RankingEntry[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("users")
    .select("display_name, contribution_points")
    .order("contribution_points", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((u, i) => ({ rank: i + 1, displayName: u.display_name, value: u.contribution_points }));
}

async function getUserDisplayNames(): Promise<Map<string, string | null>> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("users").select("id, display_name");
  if (error) throw error;
  return new Map((data ?? []).map((u) => [u.id, u.display_name]));
}

function rankByCount(countByUser: Map<string, number>, nameById: Map<string, string | null>, limit: number): RankingEntry[] {
  return Array.from(countByUser.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([userId, count], i) => ({ rank: i + 1, displayName: nameById.get(userId) ?? null, value: count }));
}

export async function getWarlordCollectionRanking(limit = 20): Promise<RankingEntry[]> {
  const supabase = createSupabaseServerClient();
  const [nameById, { data: rows, error }] = await Promise.all([
    getUserDisplayNames(),
    supabase.from("user_warlords").select("user_id"),
  ]);
  if (error) throw error;

  const countByUser = new Map<string, number>();
  for (const row of rows ?? []) {
    countByUser.set(row.user_id, (countByUser.get(row.user_id) ?? 0) + 1);
  }
  return rankByCount(countByUser, nameById, limit);
}

export async function getProvinceConquestRanking(limit = 20): Promise<RankingEntry[]> {
  const supabase = createSupabaseServerClient();
  const [nameById, { data: rows, error }] = await Promise.all([
    getUserDisplayNames(),
    supabase.from("user_provinces").select("user_id").eq("is_conquered", true),
  ]);
  if (error) throw error;

  const countByUser = new Map<string, number>();
  for (const row of rows ?? []) {
    countByUser.set(row.user_id, (countByUser.get(row.user_id) ?? 0) + 1);
  }
  return rankByCount(countByUser, nameById, limit);
}

export async function getAcademyRanking(limit = 20): Promise<RankingEntry[]> {
  const supabase = createSupabaseServerClient();
  const [nameById, { data: rows, error }] = await Promise.all([
    getUserDisplayNames(),
    supabase.from("user_activity").select("user_id").eq("activity_type", "academy_view"),
  ]);
  if (error) throw error;

  const countByUser = new Map<string, number>();
  for (const row of rows ?? []) {
    countByUser.set(row.user_id, (countByUser.get(row.user_id) ?? 0) + 1);
  }
  return rankByCount(countByUser, nameById, limit);
}

export async function getRanking(type: RankingType, limit = 20): Promise<RankingEntry[]> {
  switch (type) {
    case "contribution":
      return getContributionRanking(limit);
    case "warlord_collection":
      return getWarlordCollectionRanking(limit);
    case "province_conquest":
      return getProvinceConquestRanking(limit);
    case "academy":
      return getAcademyRanking(limit);
  }
}
