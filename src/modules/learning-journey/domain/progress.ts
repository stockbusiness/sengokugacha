// コース全体の進捗集計。DB非依存の純粋関数だけを置く。

export type MissionProgressStatus = "not_started" | "in_progress" | "completed";

export type MissionProgressInput = {
  missionId: string;
  displayOrder: number;
  status: MissionProgressStatus;
  // このミッションが解放されているか(公開期間外・停止中はfalse)。
  available: boolean;
};

export type CourseProgressSummary = {
  totalMissions: number;
  completedMissions: number;
  ratio: number;
  // 次にやるべきミッション。未完了かつ解放済みのうち最も並び順が前のもの。
  // 全部終わっていればnull。
  nextMissionId: string | null;
  allCompleted: boolean;
};

export function summarizeCourseProgress(missions: MissionProgressInput[]): CourseProgressSummary {
  const total = missions.length;
  const completed = missions.filter((mission) => mission.status === "completed").length;

  const sorted = [...missions].sort((a, b) => a.displayOrder - b.displayOrder);
  const next = sorted.find((mission) => mission.status !== "completed" && mission.available);

  return {
    totalMissions: total,
    completedMissions: completed,
    ratio: total === 0 ? 0 : completed / total,
    nextMissionId: next?.missionId ?? null,
    // ミッションが0件のコースを「修了」と誤判定しない。
    allCompleted: total > 0 && completed === total,
  };
}

// ============================================================
// 途中再開の可否(指示書§4.1「30日以内の途中再開」)
// ============================================================

// 教材の再開可否と、付与対象期間は別設定にする(指示書§4.1「30日経過後も進捗・回答を
// 保持する。教材の再開可否とOVE付与対象期間は別設定とし、付与対象外となる場合は
// 再開前に明示する」)。
export type ResumeEligibility = {
  canResume: boolean;
  rewardEligible: boolean;
  elapsedDays: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function evaluateResume(
  startedAt: string,
  now: Date,
  windows: { resumeWindowDays: number; rewardWindowDays: number }
): ResumeEligibility {
  const elapsedMs = now.getTime() - new Date(startedAt).getTime();
  // 経過日数は切り捨て。開始当日は0日目として扱う。
  const elapsedDays = Math.max(0, Math.floor(elapsedMs / MS_PER_DAY));

  return {
    canResume: elapsedDays <= windows.resumeWindowDays,
    rewardEligible: elapsedDays <= windows.rewardWindowDays,
    elapsedDays,
  };
}
