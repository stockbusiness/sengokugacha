// 「はじまりの旅」の公開判定と完了判定。DB非依存の純粋関数だけを置く。
//
// 指示書§11「すべての完了判定をサーバー側で行う」に対応する中核。ここを純粋関数に
// しておくことで、完了条件の組み合わせ(教材表示のみ / 一問クイズ / アンケート /
// 体験実績または自己申告)を単体テストで網羅できる。

export type PublicationStatus = "draft" | "published" | "suspended";

export type PublicationWindow = {
  status: PublicationStatus;
  startsAt: string | null;
  endsAt: string | null;
};

export type UnavailableReason =
  | "not_published" // 下書きのまま
  | "suspended" // 緊急停止中(指示書§17.1)
  | "before_start" // 公開開始前
  | "after_end"; // 公開終了後

export type Availability = { available: true } | { available: false; reason: UnavailableReason };

// 公開状態と公開期間の両方を見る(指示書§14.1「公開前・公開終了・停止中の制御」)。
// starts_at / ends_at が未設定なら、その方向の制限は無いものとして扱う。
export function evaluatePublication(window: PublicationWindow, now: Date): Availability {
  if (window.status === "suspended") return { available: false, reason: "suspended" };
  if (window.status !== "published") return { available: false, reason: "not_published" };

  const time = now.getTime();
  if (window.startsAt && time < new Date(window.startsAt).getTime()) {
    return { available: false, reason: "before_start" };
  }
  // ends_at はその時刻を過ぎたら終了(境界は「まだ開いている」扱い)。
  if (window.endsAt && time > new Date(window.endsAt).getTime()) {
    return { available: false, reason: "after_end" };
  }
  return { available: true };
}

// コースが閉じていればミッションも開かない。閉じている理由はコース側を優先して返す
// (利用者には「このコースは終了しました」と出したいため)。
export function evaluateMissionAvailability(
  course: PublicationWindow,
  mission: PublicationWindow,
  now: Date
): Availability {
  const courseAvailability = evaluatePublication(course, now);
  if (!courseAvailability.available) return courseAvailability;
  return evaluatePublication(mission, now);
}

// ============================================================
// 完了判定
// ============================================================

export type MissionCompletionRule = {
  requireContentViewed: boolean;
  requireAllQuestionsAnswered: boolean;
  // 0なら正解を要求しない(アンケートのみのミッション)。
  minCorrectAnswers: number;
  // 外部サービス側の体験実績を条件にするか(指示書§6のミッション3・4)。
  requireExternalAchievement: boolean;
  // 実績を確認できない場合に自己申告での完了を許すか。
  allowSelfReport: boolean;
};

export type MissionAttemptState = {
  contentViewed: boolean;
  requiredQuestionCount: number;
  answeredRequiredQuestionCount: number;
  correctAnswerCount: number;
  // 外部サービス側で体験実績を確認できたか。APIが未整備なら常にfalseになる。
  externalAchievementVerified: boolean;
  // 利用者が「体験しました」と申告したか。
  selfReported: boolean;
};

export type UnmetReason =
  | "content_not_viewed"
  | "questions_unanswered"
  | "not_enough_correct"
  | "achievement_not_verified";

export type CompletionSource = "ANSWERED" | "SELF_REPORTED";

export type CompletionEvaluation = {
  completed: boolean;
  // 完了した場合の記録元。自己申告のみで完了したものは付与額を変えられるよう区別する
  // (指示書§6「自己申告のみで完了できるミッションの付与数は運営判断事項」)。
  source: CompletionSource;
  unmet: UnmetReason[];
};

// 満たしていない条件をすべて集めて返す(最初の1件で止めない)。利用者に
// 「あと何をすれば完了するか」をまとめて示せるようにするため。
export function evaluateMissionCompletion(
  rule: MissionCompletionRule,
  state: MissionAttemptState
): CompletionEvaluation {
  const unmet: UnmetReason[] = [];

  if (rule.requireContentViewed && !state.contentViewed) {
    unmet.push("content_not_viewed");
  }

  if (rule.requireAllQuestionsAnswered && state.answeredRequiredQuestionCount < state.requiredQuestionCount) {
    unmet.push("questions_unanswered");
  }

  if (rule.minCorrectAnswers > 0 && state.correctAnswerCount < rule.minCorrectAnswers) {
    unmet.push("not_enough_correct");
  }

  // 実績を確認できていれば通常完了。確認できなくても、自己申告が許可されていて
  // 本人が申告していれば完了とし、記録元をSELF_REPORTEDにする。
  let source: CompletionSource = "ANSWERED";
  if (rule.requireExternalAchievement && !state.externalAchievementVerified) {
    if (rule.allowSelfReport && state.selfReported) {
      source = "SELF_REPORTED";
    } else {
      unmet.push("achievement_not_verified");
    }
  }

  return { completed: unmet.length === 0, source, unmet };
}

const UNMET_LABEL: Record<UnmetReason, string> = {
  content_not_viewed: "教材をご覧ください",
  questions_unanswered: "未回答の設問があります",
  not_enough_correct: "もう一度お答えください",
  achievement_not_verified: "体験の記録が確認できていません",
};

// 利用者向けの文言。専門用語を避ける(指示書§12)。
export function describeUnmetReasons(unmet: UnmetReason[]): string[] {
  return unmet.map((reason) => UNMET_LABEL[reason]);
}
