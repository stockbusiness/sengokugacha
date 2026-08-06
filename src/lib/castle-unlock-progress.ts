import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { CastleUnlockLevel } from "@/lib/castle-unlock";
import {
  describeCastleUnlockProgress,
  type CastleUnlockProgress,
} from "@/modules/castle/domain/castle-unlock-progress";

export type { CastleUnlockProgress };

export type UnlockProgressTarget = {
  castleId: string;
  unlockLevel: CastleUnlockLevel;
  // 城の主要国。未設定の城は解放条件を評価できないためnull。
  provinceId: string | null;
};

// 未解放の城について「解放まであと◯」を城一覧の件数分まとめて計算する。
// 城ごとに問い合わせるとN+1になるため、必要なテーブルを対象IDでまとめて引き、
// 突き合わせはJS側で行う(getPublishedCastlesForUserの既存方針と同じ)。
//
// 呼び出し側は「未解放の城だけ」を渡すこと。解放済みの城まで渡すと、使われない
// 武将・国の集計クエリが増えるだけになる。
export async function getUnlockProgressByCastle(
  userId: string,
  targets: UnlockProgressTarget[]
): Promise<Map<string, CastleUnlockProgress>> {
  const result = new Map<string, CastleUnlockProgress>();

  const provinceTargets = targets.filter((t) => t.unlockLevel === "PROVINCE_CONQUEST_REQUIRED" && t.provinceId);
  const regionTargets = targets.filter((t) => t.unlockLevel === "REGION_CONQUEST_REQUIRED" && t.provinceId);
  if (provinceTargets.length === 0 && regionTargets.length === 0) return result;

  const supabase = createSupabaseServerClient();
  const provinceIds = Array.from(
    new Set([...provinceTargets, ...regionTargets].map((t) => t.provinceId as string))
  );

  const { data: provinces, error: provincesError } = await supabase
    .from("provinces")
    .select("id, name, region")
    .in("id", provinceIds);
  if (provincesError) throw provincesError;

  const provinceById = new Map(
    (provinces ?? []).map((p) => [p.id as string, { name: p.name as string, region: p.region as string }])
  );

  const [requiredCounts, regionCounts] = await Promise.all([
    provinceTargets.length > 0
      ? countRequiredWarlords(
          userId,
          Array.from(new Set(provinceTargets.map((t) => t.provinceId as string)))
        )
      : Promise.resolve(new Map<string, { required: number; owned: number }>()),
    regionTargets.length > 0
      ? countRegionProvinces(
          userId,
          Array.from(
            new Set(
              regionTargets
                .map((t) => provinceById.get(t.provinceId as string)?.region)
                .filter((region): region is string => !!region)
            )
          )
        )
      : Promise.resolve(new Map<string, { total: number; conquered: number }>()),
  ]);

  for (const target of targets) {
    const province = target.provinceId ? provinceById.get(target.provinceId) : undefined;
    const warlords = target.provinceId ? requiredCounts.get(target.provinceId) : undefined;
    const region = province?.region ? regionCounts.get(province.region) : undefined;

    const progress = describeCastleUnlockProgress(target.unlockLevel, {
      provinceName: province?.name ?? null,
      requiredWarlordCount: warlords?.required ?? 0,
      ownedWarlordCount: warlords?.owned ?? 0,
      region: province?.region ?? null,
      regionProvinceCount: region?.total ?? 0,
      regionConqueredCount: region?.conquered ?? 0,
    });
    if (progress) result.set(target.castleId, progress);
  }

  return result;
}

// 国ごとの「制圧に必要な武将数」と「そのうち獲得済みの数」。
// 必須武将の決め方はgetProvinceRequiredWarlords()と同じで、conquest_rulesに
// 有効な条件があればそれを、無ければその国の武将全部を対象にする。
async function countRequiredWarlords(
  userId: string,
  provinceIds: string[]
): Promise<Map<string, { required: number; owned: number }>> {
  const supabase = createSupabaseServerClient();

  const [{ data: rules, error: rulesError }, { data: allWarlords, error: warlordsError }] = await Promise.all([
    supabase.from("conquest_rules").select("id, province_id").eq("is_active", true).in("province_id", provinceIds),
    supabase.from("warlords").select("id, province_id").in("province_id", provinceIds),
  ]);
  if (rulesError) throw rulesError;
  if (warlordsError) throw warlordsError;

  const ruleIdToProvinceId = new Map((rules ?? []).map((r) => [r.id as string, r.province_id as string]));

  const { data: ruleWarlords, error: ruleWarlordsError } =
    ruleIdToProvinceId.size > 0
      ? await supabase
          .from("conquest_rule_warlords")
          .select("rule_id, warlord_id")
          .eq("is_required", true)
          .in("rule_id", Array.from(ruleIdToProvinceId.keys()))
      : { data: [] as { rule_id: string; warlord_id: string }[], error: null };
  if (ruleWarlordsError) throw ruleWarlordsError;

  // 有効な条件が設定されている国は、その必須武将のみ。それ以外の国は武将全部。
  const provincesWithRule = new Set(ruleIdToProvinceId.values());
  const requiredIdsByProvince = new Map<string, Set<string>>(
    provinceIds.map((provinceId) => [
      provinceId,
      provincesWithRule.has(provinceId)
        ? new Set<string>()
        : new Set((allWarlords ?? []).filter((w) => w.province_id === provinceId).map((w) => w.id as string)),
    ])
  );
  for (const row of ruleWarlords ?? []) {
    const provinceId = ruleIdToProvinceId.get(row.rule_id as string);
    if (!provinceId) continue;
    requiredIdsByProvince.get(provinceId)?.add(row.warlord_id as string);
  }

  const allRequiredIds = Array.from(new Set(Array.from(requiredIdsByProvince.values()).flatMap((s) => Array.from(s))));
  const { data: ownedRows, error: ownedError } =
    allRequiredIds.length > 0
      ? await supabase.from("user_warlords").select("warlord_id").eq("user_id", userId).in("warlord_id", allRequiredIds)
      : { data: [] as { warlord_id: string }[], error: null };
  if (ownedError) throw ownedError;
  const ownedIds = new Set((ownedRows ?? []).map((r) => r.warlord_id as string));

  const counts = new Map<string, { required: number; owned: number }>();
  for (const [provinceId, requiredIds] of requiredIdsByProvince) {
    let owned = 0;
    for (const id of requiredIds) if (ownedIds.has(id)) owned += 1;
    counts.set(provinceId, { required: requiredIds.size, owned });
  }
  return counts;
}

// 地方ごとの国の数と、そのうち制圧済みの数。地方制覇の判定(getRegionProgress)と
// 同じく、天下統一用の最終国(is_final_province)は数に含めない。
async function countRegionProvinces(
  userId: string,
  regions: string[]
): Promise<Map<string, { total: number; conquered: number }>> {
  const counts = new Map<string, { total: number; conquered: number }>();
  if (regions.length === 0) return counts;

  const supabase = createSupabaseServerClient();
  const { data: provinces, error: provincesError } = await supabase
    .from("provinces")
    .select("id, region")
    .eq("is_final_province", false)
    .in("region", regions);
  if (provincesError) throw provincesError;

  const provinceIds = (provinces ?? []).map((p) => p.id as string);
  const { data: conqueredRows, error: conqueredError } =
    provinceIds.length > 0
      ? await supabase
          .from("user_provinces")
          .select("province_id")
          .eq("user_id", userId)
          .eq("is_conquered", true)
          .in("province_id", provinceIds)
      : { data: [] as { province_id: string }[], error: null };
  if (conqueredError) throw conqueredError;
  const conqueredIds = new Set((conqueredRows ?? []).map((r) => r.province_id as string));

  for (const province of provinces ?? []) {
    const region = province.region as string;
    const current = counts.get(region) ?? { total: 0, conquered: 0 };
    current.total += 1;
    if (conqueredIds.has(province.id as string)) current.conquered += 1;
    counts.set(region, current);
  }
  return counts;
}
