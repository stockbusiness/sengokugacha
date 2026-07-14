import { createSupabaseServerClient } from "@/lib/supabase-server";

export type ConquestRule = {
  id: string;
  provinceId: string;
  ruleType: "all_specified";
  isActive: boolean;
  warlordIds: string[];
};

// 国制覇条件が未設定(conquest_rulesに行が無い、またはis_active=false)の場合は
// nullを返す。呼び出し側は既存のハードコード判定(その国の武将を全部所持)へ
// フォールバックすること(実装計画3-4章、既存60国の挙動を変えないための設計)。
export async function getActiveConquestRule(provinceId: string): Promise<ConquestRule | null> {
  const supabase = createSupabaseServerClient();

  const { data: rule, error: ruleError } = await supabase
    .from("conquest_rules")
    .select("id, province_id, rule_type, is_active")
    .eq("province_id", provinceId)
    .eq("is_active", true)
    .maybeSingle();
  if (ruleError) throw ruleError;
  if (!rule) return null;

  const { data: ruleWarlords, error: warlordsError } = await supabase
    .from("conquest_rule_warlords")
    .select("warlord_id")
    .eq("rule_id", rule.id)
    .eq("is_required", true);
  if (warlordsError) throw warlordsError;

  return {
    id: rule.id as string,
    provinceId: rule.province_id as string,
    ruleType: rule.rule_type as "all_specified",
    isActive: rule.is_active as boolean,
    warlordIds: (ruleWarlords ?? []).map((w) => w.warlord_id as string),
  };
}

// 純粋関数: 必須武将を全部揃えているかの判定(rule_type='all_specified'のみ対応)。
// requiredWarlordIdsが空の場合は「条件未設定」とみなし、常にfalseを返す
// (国制覇条件0件で誤って即制覇扱いにしないためのガード)。
export function isConquestSatisfied(requiredWarlordIds: string[], ownedWarlordIds: string[]): boolean {
  if (requiredWarlordIds.length === 0) return false;
  const owned = new Set(ownedWarlordIds);
  return requiredWarlordIds.every((id) => owned.has(id));
}
