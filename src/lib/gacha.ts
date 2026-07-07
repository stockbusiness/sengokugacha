import { getLoginStreak, getStreakBonusDraws } from "@/lib/login-streak";
import { getRegionKokudakaBonus, regionCompleteAchievementType } from "@/lib/regions";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export class GachaLimitExceededError extends Error {}
export class NoEligibleProvinceError extends Error {}
export class InsufficientTicketsError extends Error {}

type DrawCore = {
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
  regionCompleted: string | null;
  regionCompletionBonus: number;
  minoUnlocked: boolean;
  tenkaToitsuTriggered: boolean;
};

export type GachaDrawResult = DrawCore & {
  remainingFreeDrawsToday: number;
};

export type PaidGachaDrawResult = DrawCore & {
  remainingPaidDrawsToday: number;
  remainingGachaTickets: number;
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

// 開始/終了どちらかが未指定なら、その境界は「制限なし」として扱う
// (03_gacha_game_design 15章: 「適用期間の開始・終了日時を指定可能(未指定なら手動で戻すまで持続)」)。
function isEventWindowActive(startAt: string | null, endAt: string | null): boolean {
  const now = new Date();
  if (startAt && now < new Date(startAt)) return false;
  if (endAt && now > new Date(endAt)) return false;
  return true;
}

// gacha_config は1行運用。行が無い場合はカラムのデフォルト値と同じ値にフォールバックする。
// 03_gacha_game_design 3章/9章: 連続ログイン日数に応じて無料ガチャの1日上限にボーナスを加算する。
async function getEffectiveFreeLimit(userId: string): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { data: config, error } = await supabase
    .from("gacha_config")
    .select(
      "base_daily_free_limit, event_free_limit_override, event_start_at, event_end_at, streak_bonus_7day_draws, streak_bonus_30day_draws"
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const streak = await getLoginStreak(userId);
  const streakBonus = config
    ? getStreakBonusDraws(streak, config.streak_bonus_7day_draws, config.streak_bonus_30day_draws)
    : getStreakBonusDraws(streak, 1, 2);

  if (!config) return 1 + streakBonus;

  if (config.event_free_limit_override != null && isEventWindowActive(config.event_start_at, config.event_end_at)) {
    return config.event_free_limit_override + streakBonus;
  }
  return config.base_daily_free_limit + streakBonus;
}

async function getEffectivePaidLimit(): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { data: config, error } = await supabase
    .from("gacha_config")
    .select("base_daily_paid_limit, event_paid_limit_override, event_start_at, event_end_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!config) return 3;

  if (config.event_paid_limit_override != null && isEventWindowActive(config.event_start_at, config.event_end_at)) {
    return config.event_paid_limit_override;
  }
  return config.base_daily_paid_limit;
}

// 「本日」はサーバーのローカル日付境界で判定する(MVP簡易実装。ユーザーのタイムゾーンは考慮しない)。
async function getTodaysDrawCount(userId: string, isPaid: boolean): Promise<number> {
  const supabase = createSupabaseServerClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("gacha_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_paid", isPaid)
    .gte("created_at", startOfDay.toISOString());

  if (error) throw error;
  return count ?? 0;
}

type ProvinceRow = {
  id: string;
  region: string;
  is_final_province: boolean;
  unlock_condition_count: number | null;
};

async function getAllProvinces(): Promise<ProvinceRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("provinces")
    .select("id, region, is_final_province, unlock_condition_count");
  if (error) throw error;
  return data ?? [];
}

// 未制圧国(美濃国は解放条件を満たすまで対象外)の一覧を返す。
async function getEligibleProvinces(
  userId: string,
  conqueredCount: number,
  allProvinces: ProvinceRow[]
): Promise<ProvinceRow[]> {
  const supabase = createSupabaseServerClient();

  const { data: conqueredRows, error: conqueredError } = await supabase
    .from("user_provinces")
    .select("province_id")
    .eq("user_id", userId)
    .eq("is_conquered", true);

  if (conqueredError) throw conqueredError;

  const conqueredIds = new Set((conqueredRows ?? []).map((r) => r.province_id as string));

  return allProvinces
    .filter((p) => !conqueredIds.has(p.id))
    .filter((p) => !p.is_final_province || (p.unlock_condition_count != null && conqueredCount >= p.unlock_condition_count));
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

// 実績を記録する。既に記録済みなら何もしない(冪等)。
async function recordAchievementOnce(userId: string, achievementType: string): Promise<boolean> {
  const supabase = createSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("achievements")
    .select("id")
    .eq("user_id", userId)
    .eq("achievement_type", achievementType)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return false;

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("referring_agent_id")
    .eq("id", userId)
    .single();
  if (userError) throw userError;

  const { error: insertError } = await supabase.from("achievements").insert({
    user_id: userId,
    achievement_type: achievementType,
    referring_agent_id: user.referring_agent_id,
  });
  if (insertError) throw insertError;

  return true;
}

async function grantKokudakaBonus(userId: string, amount: number) {
  const supabase = createSupabaseServerClient();
  const { data: user, error } = await supabase.from("users").select("kokudaka").eq("id", userId).single();
  if (error) throw error;
  const { error: updateError } = await supabase
    .from("users")
    .update({ kokudaka: user.kokudaka + amount })
    .eq("id", userId);
  if (updateError) throw updateError;
}

// 指定地方の国(美濃国を除く)がすべて制圧済みなら地方コンプ実績を記録し、石高ボーナスを付与する。
// 03_gacha_game_design 13章の称号・クーポン・イベント特典のうち、石高ボーナスのみ自動付与する
// (クーポン/イベント管理の基盤が無いため、その他は今後の課題)。
// 戻り値: 今回新たに達成した場合は付与した石高ボーナス額、それ以外は0。
async function maybeCompleteRegion(userId: string, region: string, allProvinces: ProvinceRow[]): Promise<number> {
  const supabase = createSupabaseServerClient();

  const provinceIds = allProvinces.filter((p) => p.region === region && !p.is_final_province).map((p) => p.id);
  if (provinceIds.length === 0) return 0;

  const { data: conqueredRows, error: conqueredError } = await supabase
    .from("user_provinces")
    .select("province_id")
    .eq("user_id", userId)
    .eq("is_conquered", true)
    .in("province_id", provinceIds);
  if (conqueredError) throw conqueredError;

  const allConquered = (conqueredRows ?? []).length === provinceIds.length;
  if (!allConquered) return 0;

  const newlyCompleted = await recordAchievementOnce(userId, regionCompleteAchievementType(region));
  if (!newlyCompleted) return 0;

  const bonus = getRegionKokudakaBonus(provinceIds.length);
  await grantKokudakaBonus(userId, bonus);
  return bonus;
}

// 制圧済み国数が美濃国の解放しきい値を今回の抽選で初めて超えたかどうか。
function didJustUnlockMino(previousCount: number, newCount: number, allProvinces: ProvinceRow[]): boolean {
  const mino = allProvinces.find((p) => p.is_final_province);
  if (!mino || mino.unlock_condition_count == null) return false;
  return previousCount < mino.unlock_condition_count && newCount >= mino.unlock_condition_count;
}

// 無料/有料共通の抽選本体(排出率は共通。03_gacha_game_design 9章: 「排出率は無料と完全に共通、回数のみ増える」)。
async function performDraw(userId: string, isPaid: boolean, conqueredCount: number): Promise<DrawCore> {
  const supabase = createSupabaseServerClient();

  const allProvinces = await getAllProvinces();
  const eligibleProvinces = await getEligibleProvinces(userId, conqueredCount, allProvinces);
  if (eligibleProvinces.length === 0) {
    throw new NoEligibleProvinceError("挑戦できる国がありません");
  }

  const chosenProvince = eligibleProvinces[Math.floor(Math.random() * eligibleProvinces.length)];
  const provinceId = chosenProvince.id;
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
    is_paid: isPaid,
    conquered_provinces_count_at_draw: conqueredCount,
  });
  if (logError) throw logError;

  const provinceConquered = await maybeConquerProvince(userId, provinceId);

  let regionCompleted: string | null = null;
  let regionCompletionBonus = 0;
  let minoUnlocked = false;
  let tenkaToitsuTriggered = false;

  if (provinceConquered) {
    const newConqueredCount = conqueredCount + 1;
    const bonus = await maybeCompleteRegion(userId, chosenProvince.region, allProvinces);
    if (bonus > 0) {
      regionCompleted = chosenProvince.region;
      regionCompletionBonus = bonus;
    }
    minoUnlocked = didJustUnlockMino(conqueredCount, newConqueredCount, allProvinces);
    tenkaToitsuTriggered = chosenProvince.is_final_province;
  }

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
    regionCompleted,
    regionCompletionBonus,
    minoUnlocked,
    tenkaToitsuTriggered,
  };
}

export async function drawFreeGacha(userId: string): Promise<GachaDrawResult> {
  const [freeLimit, todaysCount, conqueredCount] = await Promise.all([
    getEffectiveFreeLimit(userId),
    getTodaysDrawCount(userId, false),
    getConqueredProvinceCount(userId),
  ]);

  if (todaysCount >= freeLimit) {
    throw new GachaLimitExceededError("本日の無料ガチャ回数の上限に達しています");
  }

  const core = await performDraw(userId, false, conqueredCount);

  return {
    ...core,
    remainingFreeDrawsToday: Math.max(freeLimit - (todaysCount + 1), 0),
  };
}

// 有料ガチャ: ガチャ券を1枚消費する。排出率・国盗り判定ロジックは無料と共通。
export async function drawPaidGacha(userId: string): Promise<PaidGachaDrawResult> {
  const supabase = createSupabaseServerClient();

  const [paidLimit, todaysCount, conqueredCount, user] = await Promise.all([
    getEffectivePaidLimit(),
    getTodaysDrawCount(userId, true),
    getConqueredProvinceCount(userId),
    supabase.from("users").select("gacha_tickets").eq("id", userId).single(),
  ]);

  if (user.error) throw user.error;

  if (todaysCount >= paidLimit) {
    throw new GachaLimitExceededError("本日の有料ガチャ回数の上限に達しています");
  }
  if (user.data.gacha_tickets < 1) {
    throw new InsufficientTicketsError("ガチャ券が不足しています");
  }

  const { error: decrementError } = await supabase
    .from("users")
    .update({ gacha_tickets: user.data.gacha_tickets - 1 })
    .eq("id", userId);
  if (decrementError) throw decrementError;

  const core = await performDraw(userId, true, conqueredCount);

  return {
    ...core,
    remainingPaidDrawsToday: Math.max(paidLimit - (todaysCount + 1), 0),
    remainingGachaTickets: user.data.gacha_tickets - 1,
  };
}
