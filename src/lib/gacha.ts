import { createSupabaseServerClient } from "@/lib/supabase-server";

export class GachaLimitExceededError extends Error {}
export class NoEligibleProvinceError extends Error {}

export type GachaDrawResult = {
  warlord: {
    id: string;
    name: string;
    rarity: string;
    slotType: string;
    lore: string | null;
    imageUrl: string | null;
  };
  province: {
    id: string;
    name: string;
  };
  provinceConquered: boolean;
  remainingFreeDrawsToday: number;
};

// 04_mvp_spec_v1.2.md 3.1: 制圧済み国数に応じた排出率ティア
function getTierRates(conqueredCount: number): { rare: number; mid: number } {
  if (conqueredCount <= 5) return { rare: 0.15, mid: 0.3 };
  if (conqueredCount <= 15) return { rare: 0.1, mid: 0.3 };
  if (conqueredCount <= 30) return { rare: 0.06, mid: 0.28 };
  if (conqueredCount <= 50) return { rare: 0.03, mid: 0.25 };
  return { rare: 0.015, mid: 0.2 };
}

function pickSlot(conqueredCount: number): "common" | "mid" | "rare" {
  const { rare, mid } = getTierRates(conqueredCount);
  const r = Math.random();
  if (r < rare) return "rare";
  if (r < rare + mid) return "mid";
  return "common";
}

async function getConqueredProvinceCount(userId: string): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { count, error } = await supabase
    .from("user_provinces")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_conquered", true);

  if (error) throw error;
  return count ?? 0;
}

// gacha_config は1行運用。行が無い場合はカラムのデフォルト値と同じ値にフォールバックする。
async function getEffectiveFreeLimit(): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { data: config, error } = await supabase
    .from("gacha_config")
    .select("base_daily_free_limit, event_free_limit_override, event_start_at, event_end_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!config) return 1;

  const now = new Date();
  const eventActive =
    config.event_start_at &&
    config.event_end_at &&
    now >= new Date(config.event_start_at) &&
    now <= new Date(config.event_end_at);

  if (eventActive && config.event_free_limit_override != null) {
    return config.event_free_limit_override;
  }
  return config.base_daily_free_limit;
}

// 「本日」はサーバーのローカル日付境界で判定する(MVP簡易実装。ユーザーのタイムゾーンは考慮しない)。
async function getTodaysFreeDrawCount(userId: string): Promise<number> {
  const supabase = createSupabaseServerClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("gacha_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_paid", false)
    .gte("created_at", startOfDay.toISOString());

  if (error) throw error;
  return count ?? 0;
}

// 未制圧国(美濃国は解放条件を満たすまで対象外)の一覧を返す。
async function getEligibleProvinceIds(userId: string, conqueredCount: number): Promise<string[]> {
  const supabase = createSupabaseServerClient();

  const [{ data: conqueredRows, error: conqueredError }, { data: provinces, error: provincesError }] =
    await Promise.all([
      supabase.from("user_provinces").select("province_id").eq("user_id", userId).eq("is_conquered", true),
      supabase.from("provinces").select("id, is_final_province, unlock_condition_count"),
    ]);

  if (conqueredError) throw conqueredError;
  if (provincesError) throw provincesError;

  const conqueredIds = new Set((conqueredRows ?? []).map((r) => r.province_id as string));

  return (provinces ?? [])
    .filter((p) => !conqueredIds.has(p.id))
    .filter((p) => !p.is_final_province || (p.unlock_condition_count != null && conqueredCount >= p.unlock_condition_count))
    .map((p) => p.id);
}

async function addWarlordToUser(userId: string, warlordId: string) {
  const supabase = createSupabaseServerClient();

  const { data: existing, error: findError } = await supabase
    .from("user_warlords")
    .select("id, count")
    .eq("user_id", userId)
    .eq("warlord_id", warlordId)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase
      .from("user_warlords")
      .update({ count: existing.count + 1 })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("user_warlords")
      .insert({ user_id: userId, warlord_id: warlordId, count: 1 });
    if (error) throw error;
  }
}

// その国の3武将すべてを所持していれば制圧済みにする。戻り値: 今回の抽選で新たに制圧したかどうか。
async function maybeConquerProvince(userId: string, provinceId: string): Promise<boolean> {
  const supabase = createSupabaseServerClient();

  const { data: provinceWarlords, error: warlordsError } = await supabase
    .from("warlords")
    .select("id")
    .eq("province_id", provinceId);

  if (warlordsError) throw warlordsError;
  const warlordIds = (provinceWarlords ?? []).map((w) => w.id);
  if (warlordIds.length === 0) return false;

  const { data: ownedRows, error: ownedError } = await supabase
    .from("user_warlords")
    .select("warlord_id")
    .eq("user_id", userId)
    .in("warlord_id", warlordIds);

  if (ownedError) throw ownedError;
  const alreadyConquered = (ownedRows ?? []).length === warlordIds.length;
  if (!alreadyConquered) return false;

  const { error: upsertError } = await supabase
    .from("user_provinces")
    .upsert(
      { user_id: userId, province_id: provinceId, is_conquered: true, conquered_at: new Date().toISOString() },
      { onConflict: "user_id,province_id" }
    );

  if (upsertError) throw upsertError;
  return true;
}

export async function drawFreeGacha(userId: string): Promise<GachaDrawResult> {
  const supabase = createSupabaseServerClient();

  const [freeLimit, todaysCount, conqueredCount] = await Promise.all([
    getEffectiveFreeLimit(),
    getTodaysFreeDrawCount(userId),
    getConqueredProvinceCount(userId),
  ]);

  if (todaysCount >= freeLimit) {
    throw new GachaLimitExceededError("本日の無料ガチャ回数の上限に達しています");
  }

  const eligibleProvinceIds = await getEligibleProvinceIds(userId, conqueredCount);
  if (eligibleProvinceIds.length === 0) {
    throw new NoEligibleProvinceError("挑戦できる国がありません");
  }

  const provinceId = eligibleProvinceIds[Math.floor(Math.random() * eligibleProvinceIds.length)];
  const slot = pickSlot(conqueredCount);

  const { data: warlord, error: warlordError } = await supabase
    .from("warlords")
    .select("id, name, rarity, slot_type, lore, image_url, province_id, provinces(id, name)")
    .eq("province_id", provinceId)
    .eq("slot_type", slot)
    .single();

  if (warlordError) throw warlordError;

  await addWarlordToUser(userId, warlord.id);

  const { error: logError } = await supabase.from("gacha_logs").insert({
    user_id: userId,
    warlord_id: warlord.id,
    is_paid: false,
    conquered_provinces_count_at_draw: conqueredCount,
  });
  if (logError) throw logError;

  const provinceConquered = await maybeConquerProvince(userId, provinceId);

  const province = warlord.provinces as unknown as { id: string; name: string };

  return {
    warlord: {
      id: warlord.id,
      name: warlord.name,
      rarity: warlord.rarity,
      slotType: warlord.slot_type,
      lore: warlord.lore,
      imageUrl: warlord.image_url,
    },
    province: { id: province.id, name: province.name },
    provinceConquered,
    remainingFreeDrawsToday: Math.max(freeLimit - (todaysCount + 1), 0),
  };
}
