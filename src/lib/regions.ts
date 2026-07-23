import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  REGION_SLUGS,
  REGION_TITLES,
  getRegionKokudakaBonus,
  regionCompleteAchievementType,
} from "@/modules/conquest/domain/region-completion";

export { REGION_SLUGS, REGION_TITLES, getRegionKokudakaBonus, regionCompleteAchievementType };

export type RegionProgress = {
  region: string;
  title: string;
  totalProvinces: number;
  conqueredProvinces: number;
  isComplete: boolean;
  kokudakaBonus: number;
};

export async function getRegionProgress(userId: string): Promise<RegionProgress[]> {
  const supabase = createSupabaseServerClient();

  const [{ data: provinces, error: provincesError }, { data: conqueredRows, error: conqueredError }, { data: achievements, error: achievementsError }] =
    await Promise.all([
      supabase.from("provinces").select("id, region").eq("is_final_province", false),
      supabase.from("user_provinces").select("province_id").eq("user_id", userId).eq("is_conquered", true),
      supabase.from("achievements").select("achievement_type").eq("user_id", userId).like("achievement_type", "region_complete_%"),
    ]);

  if (provincesError) throw provincesError;
  if (conqueredError) throw conqueredError;
  if (achievementsError) throw achievementsError;

  const conqueredIds = new Set((conqueredRows ?? []).map((r) => r.province_id as string));
  const completedTypes = new Set((achievements ?? []).map((a) => a.achievement_type as string));

  const regionToProvinceIds = new Map<string, string[]>();
  for (const p of provinces ?? []) {
    const list = regionToProvinceIds.get(p.region) ?? [];
    list.push(p.id);
    regionToProvinceIds.set(p.region, list);
  }

  return Object.keys(REGION_TITLES)
    .filter((region) => regionToProvinceIds.has(region))
    .map((region) => {
      const provinceIds = regionToProvinceIds.get(region) ?? [];
      const conqueredCount = provinceIds.filter((id) => conqueredIds.has(id)).length;
      return {
        region,
        title: REGION_TITLES[region],
        totalProvinces: provinceIds.length,
        conqueredProvinces: conqueredCount,
        isComplete: completedTypes.has(regionCompleteAchievementType(region)),
        kokudakaBonus: getRegionKokudakaBonus(provinceIds.length),
      };
    });
}
