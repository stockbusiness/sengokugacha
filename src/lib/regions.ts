import { createSupabaseServerClient } from "@/lib/supabase-server";

// 03_gacha_game_design_v1.4.md 13章「地方コンプ特典」の称号。
// クーポン発行・ガチャ排出率アップイベント・NFT市場先行アクセス等の追加特典は
// 対応する基盤(クーポン/イベント管理)が無いため未実装。石高ボーナスのみ自動付与する。
export const REGION_TITLES: Record<string, string> = {
  東北: "奥州の雄",
  関東: "関八州の主",
  中部: "中部の覇者",
  近畿: "畿内の実力者",
  中国: "中国の統率者",
  四国: "四国の平定者",
  九州: "九州の覇王",
  北陸: "加賀の名将",
};

// achievements.achievement_type の命名(例: "region_complete_kanto")に使うスラグ。
export const REGION_SLUGS: Record<string, string> = {
  東北: "tohoku",
  関東: "kanto",
  中部: "chubu",
  近畿: "kinki",
  中国: "chugoku",
  四国: "shikoku",
  九州: "kyushu",
  北陸: "hokuriku",
};

export function regionCompleteAchievementType(region: string): string {
  return `region_complete_${REGION_SLUGS[region] ?? region}`;
}

const KOKUDAKA_BONUS_PER_PROVINCE = 100;

export function getRegionKokudakaBonus(provinceCount: number): number {
  return provinceCount * KOKUDAKA_BONUS_PER_PROVINCE;
}

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
