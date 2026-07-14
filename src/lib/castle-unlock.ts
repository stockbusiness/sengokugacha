import { regionCompleteAchievementType } from "@/lib/regions";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type CastleUnlockLevel = "PUBLIC" | "PROVINCE_CONQUEST_REQUIRED" | "REGION_CONQUEST_REQUIRED" | "UNPUBLISHED";

// 純粋関数: 解放条件を満たしているかの判定(実装指示書v1.0 6-6)。
// 主要国が未設定(hasPrimaryProvince=false)の場合は、管理者の設定漏れで
// 城が永久にロックされてしまうことを避けるため公開扱いにフォールバックする
// (conquest_rulesの未設定時フォールバックと同じ考え方)。
export function isCastleUnlocked(
  unlockLevel: CastleUnlockLevel,
  context: { hasPrimaryProvince: boolean; provinceConquered: boolean; regionConquered: boolean }
): boolean {
  switch (unlockLevel) {
    case "PUBLIC":
      return true;
    case "UNPUBLISHED":
      return false;
    case "PROVINCE_CONQUEST_REQUIRED":
      return context.hasPrimaryProvince ? context.provinceConquered : true;
    case "REGION_CONQUEST_REQUIRED":
      return context.hasPrimaryProvince ? context.regionConquered : true;
  }
}

// 単一の城の解放状態を判定する(城詳細ページ用)。
export async function getCastleUnlockStatus(userId: string, castleId: string): Promise<boolean> {
  const supabase = createSupabaseServerClient();

  const { data: castle, error: castleError } = await supabase
    .from("castles")
    .select("unlock_level")
    .eq("id", castleId)
    .maybeSingle();
  if (castleError) throw castleError;
  if (!castle) return false;

  const unlockLevel = castle.unlock_level as CastleUnlockLevel;
  if (unlockLevel === "PUBLIC") return true;
  if (unlockLevel === "UNPUBLISHED") return false;

  const { data: relation, error: relationError } = await supabase
    .from("castle_province_relations")
    .select("province_id")
    .eq("castle_id", castleId)
    .eq("is_primary", true)
    .maybeSingle();
  if (relationError) throw relationError;

  if (!relation) {
    return isCastleUnlocked(unlockLevel, { hasPrimaryProvince: false, provinceConquered: false, regionConquered: false });
  }

  const provinceId = relation.province_id as string;

  const [{ data: province, error: provinceError }, { data: conqueredRow, error: conqueredError }] = await Promise.all([
    supabase.from("provinces").select("region").eq("id", provinceId).maybeSingle(),
    supabase
      .from("user_provinces")
      .select("province_id")
      .eq("user_id", userId)
      .eq("province_id", provinceId)
      .eq("is_conquered", true)
      .maybeSingle(),
  ]);
  if (provinceError) throw provinceError;
  if (conqueredError) throw conqueredError;

  let regionConquered = false;
  if (province?.region) {
    const { data: achievement, error: achievementError } = await supabase
      .from("achievements")
      .select("id")
      .eq("user_id", userId)
      .eq("achievement_type", regionCompleteAchievementType(province.region))
      .maybeSingle();
    if (achievementError) throw achievementError;
    regionConquered = !!achievement;
  }

  return isCastleUnlocked(unlockLevel, {
    hasPrimaryProvince: true,
    provinceConquered: !!conqueredRow,
    regionConquered,
  });
}
