import { getDailyMissionStatus } from "@/lib/daily-missions";
import { getLoginStreak } from "@/lib/login-streak";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { MANUAL_ACTIVITY_POINTS, recordContribution } from "@/lib/user-activity";
import { confirmReferral, resolveCommonUserId } from "@/lib/common-user-hub";

export type PassportData = {
  displayName: string | null;
  rank: string;
  kokudaka: number;
  senko: number;
  gachaTickets: number;
  warlordCount: number;
  conqueredProvinceCount: number;
  totalProvinceCount: number;
  loginStreak: number;
  // Ver2.0: 国家ダッシュボード・国民証向けの拡張フィールド。
  nationalNumber: number;
  contributionPoints: number;
  affiliatedProvinceName: string | null;
  nationBuildingRate: number;
  isFoundingMember: boolean;
  foundingMemberNumber: number | null;
  developmentPlotId: string | null;
  // Ver2.1: 国家開発区画(旧・土地)向けの拡張フィールド。
  developmentArea: string | null;
  developmentPlotStatus: string;
  isNationBuilder: boolean;
  nationBuilderPlan: string | null;
};

// 04_mvp_spec 3.3: 紹介リンク(?ref=AGENT_CODE)経由の代理店を解決する。
// 一致する代理店が無い場合(コード誤り・直接登録)は null を返し、直販扱いにする。
async function resolveAgentIdByReferralCode(referralCode: string | null): Promise<string | null> {
  if (!referralCode) return null;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agents")
    .select("id")
    .eq("referral_code", referralCode)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

// LINEユーザーIDからパスポートユーザーを取得、なければ新規登録する。
// 登録済みユーザーの display_name は更新しない(ユーザーがLINE側で表示名を変えても
// パスポート上の表示名は最初の登録時点のものを保持する。仕様上の明記はないため、
// この方針に強い理由があるわけではなく、要件があれば都度上書きに変更する)。
//
// referralCode / referralSessionKey は新規登録時のみ users.referring_agent_id /
// referral_session_key に反映する。既存ユーザーには反映しない(3.3章: 「登録完了後は
// 変更不可。アトリビューションはファーストタッチ確定方式」)。
export async function findOrCreateUserByLineId(
  lineUserId: string,
  displayName: string | null,
  referralCode: string | null,
  referralSessionKey: string | null = null
): Promise<{ userId: string; isNewUser: boolean }> {
  const supabase = createSupabaseServerClient();

  const { data: existing, error: findError } = await supabase
    .from("users")
    .select("id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return { userId: existing.id as string, isNewUser: false };

  const referringAgentId = await resolveAgentIdByReferralCode(referralCode);

  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert({
      line_user_id: lineUserId,
      display_name: displayName,
      referring_agent_id: referringAgentId,
      referral_session_key: referralSessionKey,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return { userId: created.id as string, isNewUser: true };
}

// sengoku-ai.com 共通顧客HUBとの同期(EXTERNAL_DEVELOPER_GUIDE 9〜10章)。
// 未解決の場合のみcommon_user_idを解決し、新規登録時のみ紹介確定(referrals/confirm)を
// 行う。いずれもベストエフォートで、失敗してもログイン処理自体は継続させる
// (呼び出し元でcatchすること)。
export async function syncCommonUserHub(userId: string, displayName: string | null, isNewUser: boolean): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data: user, error } = await supabase
    .from("users")
    .select("common_user_id, referral_session_key")
    .eq("id", userId)
    .maybeSingle();
  if (error || !user) return;

  if (!user.common_user_id) {
    const commonUserId = await resolveCommonUserId({ externalUserId: userId, displayName });
    if (commonUserId) {
      await supabase
        .from("users")
        .update({ common_user_id: commonUserId, common_user_synced_at: new Date().toISOString() })
        .eq("id", userId);
    }
  }

  if (isNewUser && user.referral_session_key) {
    await confirmReferral({
      referralSessionKey: user.referral_session_key,
      externalUserId: userId,
      referralSource: "registration",
    });
  }
}

export async function recordLoginToday(userId: string) {
  const supabase = createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("login_logs")
    .upsert(
      { user_id: userId, login_date: today },
      { onConflict: "user_id,login_date", ignoreDuplicates: true }
    )
    .select("id");

  if (error) throw error;

  // 本日はじめてのログイン(=新規insert)の場合のみ国家貢献ポイントを付与する(Ver2.3)。
  if ((data?.length ?? 0) > 0) {
    await recordContribution(userId, "login", MANUAL_ACTIVITY_POINTS.login);
  }
}

// 国家建設率(Ver2.0初期の簡易計算)。国盗り進捗・図鑑進捗・ログイン継続・本日の任務達成の
// 加重平均。将来、国家建設の実データが揃った時点で本格的な計算に差し替える前提のダミー寄りの値。
function calcNationBuildingRate(params: {
  conqueredProvinceCount: number;
  totalProvinceCount: number;
  warlordCount: number;
  totalWarlordCount: number;
  loginStreak: number;
  completedMissionCount: number;
  totalMissionCount: number;
}): number {
  const provinceRatio =
    params.totalProvinceCount > 0 ? params.conqueredProvinceCount / params.totalProvinceCount : 0;
  const warlordRatio = params.totalWarlordCount > 0 ? params.warlordCount / params.totalWarlordCount : 0;
  const streakRatio = Math.min(params.loginStreak, 30) / 30;
  const missionRatio =
    params.totalMissionCount > 0 ? params.completedMissionCount / params.totalMissionCount : 0;

  const rate = provinceRatio * 0.4 + warlordRatio * 0.3 + streakRatio * 0.15 + missionRatio * 0.15;
  return Math.round(rate * 100);
}

async function getAffiliatedProvinceName(userId: string): Promise<string | null> {
  const supabase = createSupabaseServerClient();

  const { data: firstConquered, error: firstConqueredError } = await supabase
    .from("user_provinces")
    .select("province_id")
    .eq("user_id", userId)
    .eq("is_conquered", true)
    .order("conquered_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstConqueredError) throw firstConqueredError;
  if (!firstConquered) return null;

  const { data: province, error: provinceError } = await supabase
    .from("provinces")
    .select("name")
    .eq("id", firstConquered.province_id)
    .maybeSingle();

  if (provinceError) throw provinceError;
  return province?.name ?? null;
}

export async function getPassportData(userId: string): Promise<PassportData | null> {
  const supabase = createSupabaseServerClient();

  const { data: user, error: userError } = await supabase
    .from("users")
    .select(
      "display_name, rank, kokudaka, senko, gacha_tickets, national_number, contribution_points, is_founding_member, founding_member_number, development_plot_id, development_area, development_plot_status, is_nation_builder, nation_builder_plan"
    )
    .eq("id", userId)
    .maybeSingle();

  if (userError) throw userError;
  if (!user) return null;

  const [
    { count: warlordCount, error: warlordError },
    { count: conqueredCount, error: provinceError },
    { count: totalWarlordCount, error: totalWarlordError },
    { count: totalProvinceCount, error: totalProvinceError },
    loginStreak,
    missions,
    affiliatedProvinceName,
  ] = await Promise.all([
    supabase.from("user_warlords").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("user_provinces")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_conquered", true),
    supabase.from("warlords").select("id", { count: "exact", head: true }),
    supabase.from("provinces").select("id", { count: "exact", head: true }),
    getLoginStreak(userId),
    getDailyMissionStatus(userId),
    getAffiliatedProvinceName(userId),
  ]);

  if (warlordError) throw warlordError;
  if (provinceError) throw provinceError;
  if (totalWarlordError) throw totalWarlordError;
  if (totalProvinceError) throw totalProvinceError;

  const nationBuildingRate = calcNationBuildingRate({
    conqueredProvinceCount: conqueredCount ?? 0,
    totalProvinceCount: totalProvinceCount ?? 0,
    warlordCount: warlordCount ?? 0,
    totalWarlordCount: totalWarlordCount ?? 0,
    loginStreak,
    completedMissionCount: missions.filter((mission) => mission.completed).length,
    totalMissionCount: missions.length,
  });

  return {
    displayName: user.display_name,
    rank: user.rank,
    kokudaka: user.kokudaka,
    senko: user.senko,
    gachaTickets: user.gacha_tickets,
    warlordCount: warlordCount ?? 0,
    conqueredProvinceCount: conqueredCount ?? 0,
    totalProvinceCount: totalProvinceCount ?? 0,
    loginStreak,
    nationalNumber: user.national_number,
    contributionPoints: user.contribution_points,
    affiliatedProvinceName,
    nationBuildingRate,
    isFoundingMember: user.is_founding_member,
    foundingMemberNumber: user.founding_member_number,
    developmentPlotId: user.development_plot_id,
    developmentArea: user.development_area,
    developmentPlotStatus: user.development_plot_status,
    isNationBuilder: user.is_nation_builder,
    nationBuilderPlan: user.nation_builder_plan,
  };
}
