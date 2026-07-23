import { createSupabaseServerClient } from "@/lib/supabase-server";
import { DEFAULT_TIERS, pickTierRates, type GachaRateTier } from "@/modules/gacha/domain/rate-tiers";

export type { GachaRateTier };
export { pickTierRates };

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
