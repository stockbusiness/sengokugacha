import { getActiveConquestRule } from "@/lib/conquest-rules";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type ProvinceProgress = {
  id: string;
  name: string;
  region: string;
  isFinalProvince: boolean;
  unlockConditionCount: number | null;
  isConquered: boolean;
};

export type ProvinceProgressSummary = {
  provinces: ProvinceProgress[];
  conqueredCount: number;
};

export async function getProvinceProgress(userId: string): Promise<ProvinceProgressSummary> {
  const supabase = createSupabaseServerClient();

  const [{ data: provinces, error: provincesError }, { data: conqueredRows, error: conqueredError }] =
    await Promise.all([
      supabase
        .from("provinces")
        .select("id, name, region, is_final_province, unlock_condition_count, display_order")
        .order("display_order", { ascending: true }),
      supabase.from("user_provinces").select("province_id").eq("user_id", userId).eq("is_conquered", true),
    ]);

  if (provincesError) throw provincesError;
  if (conqueredError) throw conqueredError;

  const conqueredIds = new Set((conqueredRows ?? []).map((r) => r.province_id as string));

  const result: ProvinceProgress[] = (provinces ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    region: p.region,
    isFinalProvince: p.is_final_province,
    unlockConditionCount: p.unlock_condition_count,
    isConquered: conqueredIds.has(p.id),
  }));

  return { provinces: result, conqueredCount: conqueredIds.size };
}

export type ProvinceWarlordProgress = {
  id: string;
  name: string;
  slotType: string;
  imageUrl: string | null;
  owned: boolean;
};

// 国制覇に必要な武将の一覧(獲得済み/未獲得つき)。実装指示書v1.0フェーズ1(1-1)
// 「必須武将・獲得済み・未獲得表示」対応。conquest_rulesに有効な条件が設定されて
// いればそれを使い、無ければ従来通りその国の武将全部を対象にする
// (maybeConquerProvince()と同じフォールバックロジック)。
export async function getProvinceRequiredWarlords(
  userId: string,
  provinceId: string
): Promise<ProvinceWarlordProgress[]> {
  const supabase = createSupabaseServerClient();

  const [rule, { data: allWarlords, error: warlordsError }] = await Promise.all([
    getActiveConquestRule(provinceId),
    supabase.from("warlords").select("id, name, slot_type, image_url").eq("province_id", provinceId),
  ]);
  if (warlordsError) throw warlordsError;

  const requiredIds = rule ? new Set(rule.warlordIds) : new Set((allWarlords ?? []).map((w) => w.id as string));
  const required = (allWarlords ?? []).filter((w) => requiredIds.has(w.id as string));
  if (required.length === 0) return [];

  const { data: ownedRows, error: ownedError } = await supabase
    .from("user_warlords")
    .select("warlord_id")
    .eq("user_id", userId)
    .in(
      "warlord_id",
      required.map((w) => w.id)
    );
  if (ownedError) throw ownedError;
  const ownedSet = new Set((ownedRows ?? []).map((r) => r.warlord_id as string));

  return required.map((w) => ({
    id: w.id as string,
    name: w.name as string,
    slotType: w.slot_type as string,
    imageUrl: w.image_url as string | null,
    owned: ownedSet.has(w.id as string),
  }));
}
