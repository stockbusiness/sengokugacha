import { createSupabaseServerClient } from "@/lib/supabase-server";

export type DailyMissionDetectType = "gacha_draw" | "login" | "manual";

export type DailyMissionDef = {
  key: string;
  title: string;
  detect: DailyMissionDetectType;
};

// Ver2.0初期の「本日の任務」。完璧な達成条件管理はせず、既存ログ(ガチャ・ログイン)から
// 自動判定できるものはそこから、それ以外は各画面からの簡易な達成通知(ping)で判定する。
export const DAILY_MISSIONS: DailyMissionDef[] = [
  { key: "gacha_draw", title: "無料武将登用を行う", detect: "gacha_draw" },
  { key: "view_collection", title: "図鑑を確認する", detect: "manual" },
  { key: "view_terakoya", title: "AI寺子屋を見る", detect: "manual" },
  { key: "view_announcements", title: "お知らせを読む", detect: "manual" },
  { key: "login_streak", title: "連続ログインする", detect: "login" },
];

const MANUAL_KEYS = new Set(
  DAILY_MISSIONS.filter((mission) => mission.detect === "manual").map((mission) => mission.key)
);

export type DailyMissionStatus = { key: string; title: string; completed: boolean };

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
    return { key: mission.key, title: mission.title, completed };
  });
}

// 「図鑑を確認する」「AI寺子屋を見る」「お知らせを読む」など、ログからは自動判定できない
// 任務向けの簡易達成通知。定義済みの manual 任務キー以外は無視する。
export async function pingManualMission(userId: string, key: string): Promise<void> {
  if (!MANUAL_KEYS.has(key)) return;

  const supabase = createSupabaseServerClient();
  const today = todayDateString();

  const { error } = await supabase
    .from("daily_mission_completions")
    .upsert(
      { user_id: userId, mission_key: key, completed_date: today },
      { onConflict: "user_id,mission_key,completed_date", ignoreDuplicates: true }
    );

  if (error) throw error;
}
