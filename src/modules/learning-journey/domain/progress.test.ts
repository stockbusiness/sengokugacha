import { describe, expect, it } from "vitest";
import { evaluateResume, summarizeCourseProgress, type MissionProgressInput } from "./progress";

function mission(
  missionId: string,
  displayOrder: number,
  status: MissionProgressInput["status"],
  available = true
): MissionProgressInput {
  return { missionId, displayOrder, status, available };
}

describe("summarizeCourseProgress", () => {
  it("完了数と割合を集計する", () => {
    const summary = summarizeCourseProgress([
      mission("m1", 1, "completed"),
      mission("m2", 2, "completed"),
      mission("m3", 3, "not_started"),
      mission("m4", 4, "not_started"),
    ]);
    expect(summary).toMatchObject({ totalMissions: 4, completedMissions: 2, ratio: 0.5, allCompleted: false });
  });

  it("次にやるべきミッションは未完了で解放済みのうち最も前のもの", () => {
    const summary = summarizeCourseProgress([
      mission("m3", 3, "not_started"),
      mission("m1", 1, "completed"),
      mission("m2", 2, "in_progress"),
    ]);
    expect(summary.nextMissionId).toBe("m2");
  });

  it("未解放のミッションは次の候補にしない", () => {
    const summary = summarizeCourseProgress([
      mission("m1", 1, "completed"),
      mission("m2", 2, "not_started", false),
      mission("m3", 3, "not_started"),
    ]);
    expect(summary.nextMissionId).toBe("m3");
  });

  it("全部完了していれば次は無い", () => {
    const summary = summarizeCourseProgress([mission("m1", 1, "completed"), mission("m2", 2, "completed")]);
    expect(summary).toMatchObject({ nextMissionId: null, allCompleted: true, ratio: 1 });
  });

  it("未完了があるのに全部未解放なら次は無いが修了でもない", () => {
    const summary = summarizeCourseProgress([
      mission("m1", 1, "completed"),
      mission("m2", 2, "not_started", false),
    ]);
    expect(summary).toMatchObject({ nextMissionId: null, allCompleted: false });
  });

  // ミッションが1件も無いコースを「修了」と表示しないこと。
  it("ミッションが0件のコースは修了扱いにしない", () => {
    const summary = summarizeCourseProgress([]);
    expect(summary).toMatchObject({ totalMissions: 0, completedMissions: 0, ratio: 0, allCompleted: false });
  });
});

// 指示書§4.1「30日経過後も進捗・回答を保持する。教材の再開可否とOVE付与対象期間は
// 別設定とし、付与対象外となる場合は再開前に明示する」。
describe("evaluateResume", () => {
  const now = new Date("2026-09-20T00:00:00Z");
  const windows = { resumeWindowDays: 30, rewardWindowDays: 30 };

  it("開始当日は0日目として扱う", () => {
    const result = evaluateResume("2026-09-20T00:00:00Z", now, windows);
    expect(result).toEqual({ canResume: true, rewardEligible: true, elapsedDays: 0 });
  });

  it("期間内なら再開でき付与対象にもなる", () => {
    const result = evaluateResume("2026-09-01T00:00:00Z", now, windows);
    expect(result).toMatchObject({ canResume: true, rewardEligible: true, elapsedDays: 19 });
  });

  it("ちょうど30日目はまだ期間内", () => {
    const result = evaluateResume("2026-08-21T00:00:00Z", now, windows);
    expect(result).toMatchObject({ elapsedDays: 30, canResume: true, rewardEligible: true });
  });

  it("31日目は期間外", () => {
    const result = evaluateResume("2026-08-20T00:00:00Z", now, windows);
    expect(result).toMatchObject({ elapsedDays: 31, canResume: false, rewardEligible: false });
  });

  // 再開可否と付与対象期間は別設定。再開はできるが付与対象外、という状態を作れること。
  it("再開はできるが付与対象外、という設定にできる", () => {
    const result = evaluateResume("2026-08-01T00:00:00Z", now, {
      resumeWindowDays: 365,
      rewardWindowDays: 30,
    });
    expect(result).toMatchObject({ canResume: true, rewardEligible: false });
  });

  it("開始時刻が未来でも経過日数を負にしない", () => {
    const result = evaluateResume("2026-10-01T00:00:00Z", now, windows);
    expect(result.elapsedDays).toBe(0);
  });
});
