import crypto from "node:crypto";
import { selectAnimationForDraw, type SelectedAnimation } from "@/lib/gacha-animations";
import { getGachaRateTiers } from "@/lib/gacha-rate-tiers";
import { getLoginStreak, getStreakBonusDraws } from "@/lib/login-streak";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { GachaLimitExceededError, InsufficientTicketsError, NoEligibleProvinceError } from "@/modules/gacha/domain/errors";
import { pickSlot } from "@/modules/gacha/domain/draw-policy";
import { didJustUnlockMino, getTokyoBusinessDate, isEventWindowActive, type ProvinceRow } from "@/modules/gacha/domain/draw-limit";

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

type ExecuteGachaDrawResult = {
  log_id: string;
  is_new_card: boolean;
  province_conquered: boolean;
  region_completed: string | null;
  region_completion_bonus: number;
  contribution_points_earned: number;
  remaining_draws_today: number;
  remaining_gacha_tickets: number | null;
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

// 無料/有料共通の抽選本体(排出率は共通。03_gacha_game_design 9章: 「排出率は無料と完全に共通、回数のみ増える」)。
//
// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-4(§8)。
// 国・スロット・武将の決定(排出率tier参照)はDB設定に依存する読み取り専用処理のため
// ここ(TS)で行うが、その決定結果を反映する書き込み側(日次上限予約・ガチャ券消費・
// user_warlords更新・gacha_logs追加・国家貢献ポイント加算・国制覇・実績・地方ボーナス)は
// execute_gacha_draw()(マイグレーション20260808000006)へ委ね、単一トランザクションで
// 実行する。動画演出の選定・記録のみ、既存方針(失敗してもガチャ自体を失敗させない)を
// 維持するためコミット後のベストエフォート処理として残す。
async function performDraw(
  userId: string,
  isPaid: boolean,
  conqueredCount: number,
  dailyLimit: number
): Promise<DrawCore & { remainingDrawsToday: number; remainingGachaTickets: number | null }> {
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

  const { data: drawResultData, error: drawError } = await supabase
    .rpc("execute_gacha_draw", {
      p_user_id: userId,
      p_draw_type: isPaid ? "paid" : "free",
      p_business_date: getTokyoBusinessDate(new Date()),
      p_daily_limit: dailyLimit,
      p_selected_province_id: provinceId,
      p_selected_warlord_id: warlord.id,
      p_conquered_provinces_count_at_draw: conqueredCount,
      p_request_id: crypto.randomUUID(),
    })
    .single();
  if (drawError) {
    if (drawError.message?.includes("gacha_daily_limit_exceeded")) {
      throw new GachaLimitExceededError(
        isPaid ? "本日の有料ガチャ回数の上限に達しています" : "本日の無料ガチャ回数の上限に達しています"
      );
    }
    if (drawError.message?.includes("insufficient_gacha_tickets")) {
      throw new InsufficientTicketsError("ガチャ券が不足しています");
    }
    throw drawError;
  }
  const drawResult = drawResultData as ExecuteGachaDrawResult;

  // 動画演出の選定は結果表示用の付随情報であり、失敗してもガチャ自体を
  // 失敗させてはならない(仕様書2.1/5.4)。原子的トランザクションのコミット後に
  // ベストエフォートで選定・記録する。
  const animation = await selectAnimationForDraw(warlord.slot_type as "common" | "mid" | "rare", drawResult.is_new_card).catch(
    (error) => {
      console.error("ガチャ動画演出の選定に失敗しました", error);
      return null;
    }
  );
  if (animation) {
    const { error: animationUpdateError } = await supabase
      .from("gacha_logs")
      .update({ animation_asset_id: animation.id, animation_key: animation.key })
      .eq("id", drawResult.log_id);
    if (animationUpdateError) {
      console.error("ガチャ動画演出の記録に失敗しました", animationUpdateError);
    }
  }

  let minoUnlocked = false;
  let tenkaToitsuTriggered = false;
  if (drawResult.province_conquered) {
    const newConqueredCount = conqueredCount + 1;
    minoUnlocked = didJustUnlockMino(conqueredCount, newConqueredCount, allProvinces);
    tenkaToitsuTriggered = chosenProvince.is_final_province;
  }

  const province = warlord.provinces as unknown as { id: string; name: string };

  return {
    drawLogId: drawResult.log_id,
    warlord: {
      id: warlord.id,
      name: warlord.name,
      rarity: warlord.rarity,
      slotType: warlord.slot_type,
      lore: warlord.lore,
      imageUrl: warlord.image_url,
    },
    province: { id: province.id, name: province.name },
    provinceConquered: drawResult.province_conquered,
    regionCompleted: drawResult.region_completed,
    regionCompletionBonus: drawResult.region_completion_bonus,
    minoUnlocked,
    tenkaToitsuTriggered,
    isNewCard: drawResult.is_new_card,
    animation,
    contributionPointsEarned: drawResult.contribution_points_earned,
    remainingDrawsToday: drawResult.remaining_draws_today,
    remainingGachaTickets: drawResult.remaining_gacha_tickets,
  };
}

export async function drawFreeGacha(userId: string): Promise<GachaDrawResult> {
  const [freeLimit, conqueredCount] = await Promise.all([getEffectiveFreeLimit(userId), getConqueredProvinceCount(userId)]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 無料ガチャのレスポンスには含めない。
  const { remainingDrawsToday, remainingGachaTickets: _remainingGachaTickets, ...core } = await performDraw(
    userId,
    false,
    conqueredCount,
    freeLimit
  );

  return {
    ...core,
    remainingFreeDrawsToday: remainingDrawsToday,
  };
}

// 有料ガチャ: ガチャ券を1枚消費する。排出率・国盗り判定ロジックは無料と共通。
export async function drawPaidGacha(userId: string): Promise<PaidGachaDrawResult> {
  const [paidLimit, conqueredCount] = await Promise.all([getEffectivePaidLimit(), getConqueredProvinceCount(userId)]);

  const { remainingDrawsToday, remainingGachaTickets, ...core } = await performDraw(userId, true, conqueredCount, paidLimit);

  return {
    ...core,
    remainingPaidDrawsToday: remainingDrawsToday,
    remainingGachaTickets: remainingGachaTickets as number,
  };
}
