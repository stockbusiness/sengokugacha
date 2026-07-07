import { createSupabaseServerClient } from "@/lib/supabase-server";

export type GachaRateTier = {
  id: string;
  tier_order: number;
  max_conquered_count: number | null;
  rare_rate: number;
  mid_rate: number;
};

// テーブルが空の場合(未マイグレーション等)のフォールバック。
// 03_gacha_game_design_v1.4.md 9章のティア表と同じ値。
const DEFAULT_TIERS: GachaRateTier[] = [
  { id: "default-1", tier_order: 1, max_conquered_count: 5, rare_rate: 0.15, mid_rate: 0.3 },
  { id: "default-2", tier_order: 2, max_conquered_count: 15, rare_rate: 0.1, mid_rate: 0.3 },
  { id: "default-3", tier_order: 3, max_conquered_count: 30, rare_rate: 0.06, mid_rate: 0.28 },
  { id: "default-4", tier_order: 4, max_conquered_count: 50, rare_rate: 0.03, mid_rate: 0.25 },
  { id: "default-5", tier_order: 5, max_conquered_count: null, rare_rate: 0.015, mid_rate: 0.2 },
];

export async function getGachaRateTiers(): Promise<GachaRateTier[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("gacha_rate_tiers")
    .select("*")
    .order("tier_order", { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return DEFAULT_TIERS;
  return data;
}

// tier_order の昇順で最初に条件を満たした階層のレートを返す。
// max_conquered_count が null の行は「それ以降すべて」を意味する。
export function pickTierRates(tiers: GachaRateTier[], conqueredCount: number): { rare: number; mid: number } {
  for (const tier of tiers) {
    if (tier.max_conquered_count == null || conqueredCount <= tier.max_conquered_count) {
      return { rare: tier.rare_rate, mid: tier.mid_rate };
    }
  }
  const last = tiers[tiers.length - 1];
  return last ? { rare: last.rare_rate, mid: last.mid_rate } : { rare: 0.015, mid: 0.2 };
}
