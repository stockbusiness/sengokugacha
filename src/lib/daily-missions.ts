import { createSupabaseServerClient } from "@/lib/supabase-server";
import { MANUAL_ACTIVITY_POINTS, recordContribution, type ActivityType } from "@/lib/user-activity";

export type DailyMissionDetectType = "gacha_draw" | "login" | "manual";

export type DailyMissionDef = {
  key: string;
  title: string;
  detect: DailyMissionDetectType;
  // 本日1回だけ達成した時点でuser_activityに記録され、users.contribution_pointsへ実際に
  // 加算されるポイント(Ver2.3で実装)。対応する活動種別を持たない任務は0(完了状態の表示のみ)。
  rewardPoint: number;
};

// Ver2.0初期の「本日の任務」。完璧な達成条件管理はせず、既存ログ(ガチャ・ログイン)から
// 自動判定できるものはそこから、それ以外は各画面からの簡易な達成通知(ping)で判定する。
// Ver2.2でAI寺子屋・市場・イベント関連の任務を追加。Ver2.3で実際のポイント付与に対応。
export const DAILY_MISSIONS: DailyMissionDef[] = [
  { key: "gacha_draw", title: "無料武将登用を行う", detect: "gacha_draw", rewardPoint: 0 },
  { key: "view_collection", title: "図鑑を確認する", detect: "manual", rewardPoint: 0 },
  { key: "view_terakoya", title: "AI寺子屋を見る", detect: "manual", rewardPoint: MANUAL_ACTIVITY_POINTS.academy_view },
  { key: "view_market", title: "市場を確認する", detect: "manual", rewardPoint: MANUAL_ACTIVITY_POINTS.market_view },
  { key: "view_events", title: "イベント情報を見る", detect: "manual", rewardPoint: MANUAL_ACTIVITY_POINTS.event_view },
  { key: "view_nation_builder_info", title: "建国メンバー案内を見る", detect: "manual", rewardPoint: 0 },
  { key: "view_announcements", title: "お知らせを読む", detect: "manual", rewardPoint: 0 },
  { key: "login_streak", title: "連続ログインする", detect: "login", rewardPoint: 0 },
];

// manual任務のうち、達成時に国家貢献ポイントを実際に付与するものだけを対応付ける
// (指示書1章の取得例: AI寺子屋・イベント参加・市場閲覧。図鑑確認・お知らせ・建国メンバー案内は
// 完了状態の表示のみで、ポイント付与の対象外とする)。
const MISSION_ACTIVITY_TYPE: Partial<Record<string, Exclude<ActivityType, "gacha_draw" | "login">>> = {
  view_terakoya: "academy_view",
  view_market: "market_view",
  view_events: "event_view",
};

const MANUAL_KEYS = new Set(
  DAILY_MISSIONS.filter((mission) => mission.detect === "manual").map((mission) => mission.key)
);

export type DailyMissionStatus = { key: string; title: string; completed: boolean; rewardPoint: number };

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getDailyMissionStatus(userId: string): Promise<DailyMissionStatus[]> {
  const supabase = createSupabaseServerClient();
  const today = todayDateString();

  const [
    { data: manualRows, error: manualError },
    { count: drawCount, error: drawError },
    { data: loginRow, error: loginError },
  ] = await Promise.all([
    supabase
      .from("daily_mission_completions")
      .select("mission_key")
      .eq("user_id", userId)
      .eq("completed_date", today),
    supabase
      .from("gacha_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", `${today}T00:00:00.000Z`),
    supabase.from("login_logs").select("id").eq("user_id", userId).eq("login_date", today).maybeSingle(),
  ]);

  if (manualError) throw manualError;
  if (drawError) throw drawError;
  if (loginError) throw loginError;

  const manualDone = new Set((manualRows ?? []).map((row) => row.mission_key as string));

  return DAILY_MISSIONS.map((mission) => {
    let completed = false;
    if (mission.detect === "gacha_draw") completed = (drawCount ?? 0) > 0;
    else if (mission.detect === "login") completed = !!loginRow;
    else completed = manualDone.has(mission.key);
    return { key: mission.key, title: mission.title, completed, rewardPoint: mission.rewardPoint };
  });
}

// 「図鑑を確認する」「AI寺子屋を見る」「お知らせを読む」など、ログからは自動判定できない
// 任務向けの簡易達成通知。定義済みの manual 任務キー以外は無視する。
// 本日はじめての達成(=新規insert)の場合のみ、対応する国家貢献ポイントを付与する
// (ページを何度開いてもポイントが増えないようにするため)。
export async function pingManualMission(userId: string, key: string): Promise<void> {
  if (!MANUAL_KEYS.has(key)) return;

  const supabase = createSupabaseServerClient();
  const today = todayDateString();

  const { data, error } = await supabase
    .from("daily_mission_completions")
    .upsert(
      { user_id: userId, mission_key: key, completed_date: today },
      { onConflict: "user_id,mission_key,completed_date", ignoreDuplicates: true }
    )
    .select("id");

  if (error) throw error;

  const isFreshCompletion = (data?.length ?? 0) > 0;
  const activityType = MISSION_ACTIVITY_TYPE[key];
  if (isFreshCompletion && activityType) {
    await recordContribution(userId, activityType, MANUAL_ACTIVITY_POINTS[activityType]);
  }
}
