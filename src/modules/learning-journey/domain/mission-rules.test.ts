import { describe, expect, it } from "vitest";
import {
  describeUnmetReasons,
  evaluateMissionAvailability,
  evaluateMissionCompletion,
  evaluatePublication,
  type MissionAttemptState,
  type MissionCompletionRule,
} from "./mission-rules";

const NOW = new Date("2026-08-20T12:00:00Z");

const OPEN = { status: "published" as const, startsAt: null, endsAt: null };

describe("evaluatePublication", () => {
  it("公開中で期間の指定が無ければ利用できる", () => {
    expect(evaluatePublication(OPEN, NOW)).toEqual({ available: true });
  });

  it("下書きは利用できない", () => {
    expect(evaluatePublication({ ...OPEN, status: "draft" }, NOW)).toEqual({
      available: false,
      reason: "not_published",
    });
  });

  it("停止中は利用できない(緊急停止)", () => {
    expect(evaluatePublication({ ...OPEN, status: "suspended" }, NOW)).toEqual({
      available: false,
      reason: "suspended",
    });
  });

  it("公開開始前は利用できない", () => {
    const result = evaluatePublication({ ...OPEN, startsAt: "2026-08-21T00:00:00Z" }, NOW);
    expect(result).toEqual({ available: false, reason: "before_start" });
  });

  it("公開終了後は利用できない", () => {
    const result = evaluatePublication({ ...OPEN, endsAt: "2026-08-19T00:00:00Z" }, NOW);
    expect(result).toEqual({ available: false, reason: "after_end" });
  });

  it("公開期間の内側なら利用できる", () => {
    const result = evaluatePublication(
      { ...OPEN, startsAt: "2026-08-01T00:00:00Z", endsAt: "2026-09-01T00:00:00Z" },
      NOW
    );
    expect(result).toEqual({ available: true });
  });

  // 境界の扱いを固定しておく(終了時刻ちょうどはまだ開いている)。
  it("終了時刻ちょうどはまだ利用できる", () => {
    expect(evaluatePublication({ ...OPEN, endsAt: NOW.toISOString() }, NOW)).toEqual({ available: true });
  });

  it("開始時刻ちょうどから利用できる", () => {
    expect(evaluatePublication({ ...OPEN, startsAt: NOW.toISOString() }, NOW)).toEqual({ available: true });
  });
});

describe("evaluateMissionAvailability", () => {
  it("コースが閉じていればミッションが公開中でも利用できない", () => {
    const result = evaluateMissionAvailability({ ...OPEN, status: "suspended" }, OPEN, NOW);
    expect(result).toEqual({ available: false, reason: "suspended" });
  });

  it("コースが開いていてもミッションが下書きなら利用できない", () => {
    const result = evaluateMissionAvailability(OPEN, { ...OPEN, status: "draft" }, NOW);
    expect(result).toEqual({ available: false, reason: "not_published" });
  });

  it("両方開いていれば利用できる", () => {
    expect(evaluateMissionAvailability(OPEN, OPEN, NOW)).toEqual({ available: true });
  });
});

// ============================================================

const BASE_RULE: MissionCompletionRule = {
  requireContentViewed: true,
  requireAllQuestionsAnswered: false,
  minCorrectAnswers: 0,
  requireExternalAchievement: false,
  allowSelfReport: false,
};

const BASE_STATE: MissionAttemptState = {
  contentViewed: false,
  requiredQuestionCount: 0,
  answeredRequiredQuestionCount: 0,
  correctAnswerCount: 0,
  externalAchievementVerified: false,
  selfReported: false,
};

describe("evaluateMissionCompletion", () => {
  // 指示書§6 ミッション1「教材表示＋一問回答」等、各完了条件を個別に確認する。

  it("教材表示のみが条件なら、表示しただけで完了する", () => {
    const result = evaluateMissionCompletion(BASE_RULE, { ...BASE_STATE, contentViewed: true });
    expect(result).toMatchObject({ completed: true, source: "ANSWERED", unmet: [] });
  });

  it("教材未表示なら完了しない", () => {
    const result = evaluateMissionCompletion(BASE_RULE, BASE_STATE);
    expect(result.completed).toBe(false);
    expect(result.unmet).toContain("content_not_viewed");
  });

  it("必須設問が未回答なら完了しない", () => {
    const result = evaluateMissionCompletion(
      { ...BASE_RULE, requireAllQuestionsAnswered: true },
      { ...BASE_STATE, contentViewed: true, requiredQuestionCount: 3, answeredRequiredQuestionCount: 2 }
    );
    expect(result.completed).toBe(false);
    expect(result.unmet).toEqual(["questions_unanswered"]);
  });

  it("必須設問を全部答えれば完了する", () => {
    const result = evaluateMissionCompletion(
      { ...BASE_RULE, requireAllQuestionsAnswered: true },
      { ...BASE_STATE, contentViewed: true, requiredQuestionCount: 3, answeredRequiredQuestionCount: 3 }
    );
    expect(result.completed).toBe(true);
  });

  it("正解数が足りなければ完了しない(不正解時の未完了)", () => {
    const result = evaluateMissionCompletion(
      { ...BASE_RULE, minCorrectAnswers: 1 },
      { ...BASE_STATE, contentViewed: true, correctAnswerCount: 0 }
    );
    expect(result.completed).toBe(false);
    expect(result.unmet).toEqual(["not_enough_correct"]);
  });

  it("正解すれば完了する", () => {
    const result = evaluateMissionCompletion(
      { ...BASE_RULE, minCorrectAnswers: 1 },
      { ...BASE_STATE, contentViewed: true, correctAnswerCount: 1 }
    );
    expect(result.completed).toBe(true);
  });

  it("アンケートのみのミッションでは正解を要求しない", () => {
    const result = evaluateMissionCompletion(
      { ...BASE_RULE, requireAllQuestionsAnswered: true, minCorrectAnswers: 0 },
      { ...BASE_STATE, contentViewed: true, requiredQuestionCount: 1, answeredRequiredQuestionCount: 1 }
    );
    expect(result.completed).toBe(true);
  });

  // 指示書§6「外部サービスの体験実績APIが未整備の場合、初期版は回答による自己申告を許可し、
  // その記録に SELF_REPORTED を残すこと」。

  it("体験実績を確認できれば通常完了(ANSWERED)になる", () => {
    const result = evaluateMissionCompletion(
      { ...BASE_RULE, requireExternalAchievement: true, allowSelfReport: true },
      { ...BASE_STATE, contentViewed: true, externalAchievementVerified: true }
    );
    expect(result).toMatchObject({ completed: true, source: "ANSWERED" });
  });

  it("実績を確認できなくても、自己申告が許可され申告があれば完了しSELF_REPORTEDになる", () => {
    const result = evaluateMissionCompletion(
      { ...BASE_RULE, requireExternalAchievement: true, allowSelfReport: true },
      { ...BASE_STATE, contentViewed: true, selfReported: true }
    );
    expect(result).toMatchObject({ completed: true, source: "SELF_REPORTED", unmet: [] });
  });

  it("自己申告が許可されていなければ、申告があっても完了しない", () => {
    const result = evaluateMissionCompletion(
      { ...BASE_RULE, requireExternalAchievement: true, allowSelfReport: false },
      { ...BASE_STATE, contentViewed: true, selfReported: true }
    );
    expect(result.completed).toBe(false);
    expect(result.unmet).toEqual(["achievement_not_verified"]);
  });

  it("自己申告が許可されていても申告が無ければ完了しない", () => {
    const result = evaluateMissionCompletion(
      { ...BASE_RULE, requireExternalAchievement: true, allowSelfReport: true },
      { ...BASE_STATE, contentViewed: true }
    );
    expect(result.completed).toBe(false);
    expect(result.unmet).toEqual(["achievement_not_verified"]);
  });

  it("実績を確認できていれば、自己申告の有無に関わらずANSWEREDを優先する", () => {
    const result = evaluateMissionCompletion(
      { ...BASE_RULE, requireExternalAchievement: true, allowSelfReport: true },
      { ...BASE_STATE, contentViewed: true, externalAchievementVerified: true, selfReported: true }
    );
    expect(result.source).toBe("ANSWERED");
  });

  it("満たしていない条件をすべて集めて返す(最初の1件で止めない)", () => {
    const result = evaluateMissionCompletion(
      {
        requireContentViewed: true,
        requireAllQuestionsAnswered: true,
        minCorrectAnswers: 1,
        requireExternalAchievement: true,
        allowSelfReport: false,
      },
      { ...BASE_STATE, requiredQuestionCount: 2 }
    );
    expect(result.unmet).toEqual([
      "content_not_viewed",
      "questions_unanswered",
      "not_enough_correct",
      "achievement_not_verified",
    ]);
  });

  // 完了しなかった場合、sourceは使われないが未定義にはしない。
  it("未完了でもsourceは常に返る", () => {
    const result = evaluateMissionCompletion(BASE_RULE, BASE_STATE);
    expect(result.source).toBe("ANSWERED");
  });
});

describe("describeUnmetReasons", () => {
  it("利用者向けの文言へ変換する", () => {
    expect(describeUnmetReasons(["content_not_viewed", "not_enough_correct"])).toEqual([
      "教材をご覧ください",
      "もう一度お答えください",
    ]);
  });
});
