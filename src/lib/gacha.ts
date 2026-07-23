import { consumeGachaTicket } from "@/lib/atomic-balance";
import { getActiveConquestRule, isConquestSatisfied } from "@/lib/conquest-rules";
import { selectAnimationForDraw, type SelectedAnimation } from "@/lib/gacha-animations";
import { getGachaRateTiers } from "@/lib/gacha-rate-tiers";
import { getLoginStreak, getStreakBonusDraws } from "@/lib/login-streak";
import { getRegionKokudakaBonus, regionCompleteAchievementType } from "@/lib/regions";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { recordContribution } from "@/lib/user-activity";
import { GachaLimitExceededError, InsufficientTicketsError, NoEligibleProvinceError } from "@/modules/gacha/domain/errors";
import { pickSlot } from "@/modules/gacha/domain/draw-policy";
import { didJustUnlockMino, isEventWindowActive, type ProvinceRow } from "@/modules/gacha/domain/draw-limit";
import { calcContributionPoints } from "@/modules/gacha/domain/rarity";

export { GachaLimitExceededError, InsufficientTicketsError, NoEligibleProvinceError };

type DrawCore = {
  drawLogId: string;
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
  isNewCard: boolean;
  animation: SelectedAnimation | null;
  contributionPointsEarned: number;
};

export type GachaDrawResult = DrawCore & {
  remainingFreeDrawsToday: number;
};

export type PaidGachaDrawResult = DrawCore & {
  remainingPaidDrawsToday: number;
  remainingGachaTickets: number;
};

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

// 戻り値: このユーザーが今回初めてこの武将を獲得した(新規)かどうか。
async function addWarlordToUser(userId: string, warlordId: string): Promise<boolean> {
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
    return false;
  }

  const { error } = await supabase
    .from("user_warlords")
    .insert({ user_id: userId, warlord_id: warlordId, count: 1 });
  if (error) throw error;
  return true;
}

// 国制覇条件を満たしていれば制圧済みにする。戻り値: 今回の抽選で新たに制圧したかどうか。
// conquest_rulesに有効な条件が設定されていればそれを使い、無ければ従来通り
// 「その国の武将を全部所持」で判定する(既存60国の挙動を変えないフォールバック。
// 実装計画3-4章参照)。
async function maybeConquerProvince(userId: string, provinceId: string): Promise<boolean> {
  const supabase = createSupabaseServerClient();

  const rule = await getActiveConquestRule(provinceId);

  let warlordIds: string[];
  if (rule) {
    warlordIds = rule.warlordIds;
  } else {
    const { data: provinceWarlords, error: warlordsError } = await supabase
      .from("warlords")
      .select("id")
      .eq("province_id", provinceId);
    if (warlordsError) throw warlordsError;
    warlordIds = (provinceWarlords ?? []).map((w) => w.id);
  }
  if (warlordIds.length === 0) return false;

  const { data: ownedRows, error: ownedError } = await supabase
    .from("user_warlords")
    .select("warlord_id")
    .eq("user_id", userId)
    .in("warlord_id", warlordIds);

  if (ownedError) throw ownedError;
  const alreadyConquered = isConquestSatisfied(
    warlordIds,
    (ownedRows ?? []).map((r) => r.warlord_id as string)
  );
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

// 無料/有料共通の抽選本体(排出率は共通。03_gacha_game_design 9章: 「排出率は無料と完全に共通、回数のみ増える」)。
async function performDraw(userId: string, isPaid: boolean, conqueredCount: number): Promise<DrawCore> {
  const supabase = createSupabaseServerClient();

  const [allProvinces, tiers] = await Promise.all([getAllProvinces(), getGachaRateTiers()]);
  const eligibleProvinces = await getEligibleProvinces(userId, conqueredCount, allProvinces);
  if (eligibleProvinces.length === 0) {
    throw new NoEligibleProvinceError("挑戦できる国がありません");
  }

  const chosenProvince = eligibleProvinces[Math.floor(Math.random() * eligibleProvinces.length)];
  const provinceId = chosenProvince.id;
  const slot = pickSlot(conqueredCount, tiers);

  const { data: warlord, error: warlordError } = await supabase
    .from("warlords")
    .select("id, name, rarity, slot_type, lore, image_url, province_id, provinces(id, name)")
    .eq("province_id", provinceId)
    .eq("slot_type", slot)
    .single();

  if (warlordError) throw warlordError;

  const isNewCard = await addWarlordToUser(userId, warlord.id);

  // 動画演出の選定は結果表示用の付随情報であり、失敗してもガチャ自体を
  // 失敗させてはならない(仕様書2.1/5.4)。
  const animation = await selectAnimationForDraw(
    warlord.slot_type as "common" | "mid" | "rare",
    isNewCard
  ).catch((error) => {
    console.error("ガチャ動画演出の選定に失敗しました", error);
    return null;
  });

  const { data: log, error: logError } = await supabase
    .from("gacha_logs")
    .insert({
      user_id: userId,
      warlord_id: warlord.id,
      is_paid: isPaid,
      conquered_provinces_count_at_draw: conqueredCount,
      animation_asset_id: animation?.id ?? null,
      animation_key: animation?.key ?? null,
    })
    .select("id")
    .single();
  if (logError) throw logError;

  const contributionPointsEarned = calcContributionPoints(warlord.slot_type, isNewCard);
  await recordContribution(userId, "gacha_draw", contributionPointsEarned);

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
    drawLogId: log.id,
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
    isNewCard,
    animation,
    contributionPointsEarned,
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
  const [paidLimit, todaysCount, conqueredCount] = await Promise.all([
    getEffectivePaidLimit(),
    getTodaysDrawCount(userId, true),
    getConqueredProvinceCount(userId),
  ]);

  if (todaysCount >= paidLimit) {
    throw new GachaLimitExceededError("本日の有料ガチャ回数の上限に達しています");
  }

  // ガチャ券消費は原子的なDB関数で行う(read-modify-write競合の解消。
  // 全体統合対応 実装計画PR2)。残高不足時はDB側がinsufficient_gacha_ticketsを送出する。
  let remainingGachaTickets: number;
  try {
    remainingGachaTickets = await consumeGachaTicket(userId);
  } catch (error) {
    if (error instanceof Error && error.message.includes("insufficient_gacha_tickets")) {
      throw new InsufficientTicketsError("ガチャ券が不足しています");
    }
    throw error;
  }

  const core = await performDraw(userId, true, conqueredCount);

  return {
    ...core,
    remainingPaidDrawsToday: Math.max(paidLimit - (todaysCount + 1), 0),
    remainingGachaTickets,
  };
}
