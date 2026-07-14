import { logAdminAction } from "@/lib/admin-audit-log";
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

// ============================================================
// 管理画面向けCRUD(/admin/conquest-rules)。
// ============================================================

export async function listConquestRules(): Promise<ConquestRule[]> {
  const supabase = createSupabaseServerClient();

  const { data: rules, error: rulesError } = await supabase
    .from("conquest_rules")
    .select("id, province_id, rule_type, is_active");
  if (rulesError) throw rulesError;
  if (!rules || rules.length === 0) return [];

  const { data: ruleWarlords, error: warlordsError } = await supabase
    .from("conquest_rule_warlords")
    .select("rule_id, warlord_id")
    .in(
      "rule_id",
      rules.map((r) => r.id)
    );
  if (warlordsError) throw warlordsError;

  return rules.map((r) => ({
    id: r.id as string,
    provinceId: r.province_id as string,
    ruleType: r.rule_type as "all_specified",
    isActive: r.is_active as boolean,
    warlordIds: (ruleWarlords ?? [])
      .filter((w) => w.rule_id === r.id)
      .map((w) => w.warlord_id as string),
  }));
}

// 国制覇条件を作成・更新する(province_idにつき1行、upsert)。トランザクションは
// 使わず、conquest_rules更新→conquest_rule_warlords全入れ替えの逐次処理とする
// (本コードベースの既存の慣習に合わせる)。
// 指示書6-3「条件変更で既に制覇した国を原則未制覇へ戻さない」に従い、
// user_provinces.is_conqueredの取消は一切行わない。
export async function upsertConquestRule(
  provinceId: string,
  isActive: boolean,
  requiredWarlordIds: string[],
  actorName: string | null
): Promise<void> {
  const supabase = createSupabaseServerClient();

  const { data: rule, error: upsertError } = await supabase
    .from("conquest_rules")
    .upsert(
      { province_id: provinceId, rule_type: "all_specified", is_active: isActive, updated_at: new Date().toISOString() },
      { onConflict: "province_id" }
    )
    .select("id")
    .single();
  if (upsertError) throw upsertError;

  const { error: deleteError } = await supabase
    .from("conquest_rule_warlords")
    .delete()
    .eq("rule_id", rule.id);
  if (deleteError) throw deleteError;

  if (requiredWarlordIds.length > 0) {
    const { error: insertError } = await supabase.from("conquest_rule_warlords").insert(
      requiredWarlordIds.map((warlordId) => ({ rule_id: rule.id, warlord_id: warlordId, is_required: true }))
    );
    if (insertError) throw insertError;
  }

  await logAdminAction(actorName, "conquest_rule_upsert", `province_id=${provinceId} is_active=${isActive}`, {
    targetType: "conquest_rule",
    targetId: rule.id as string,
    after: { provinceId, isActive, requiredWarlordIds },
  });
}
