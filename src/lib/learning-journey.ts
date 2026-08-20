import { getLearningJourneySettings } from "@/lib/learning-journey-settings";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  evaluateMissionAvailability,
  evaluateMissionCompletion,
  type Availability,
  type CompletionSource,
  type MissionCompletionRule,
  type PublicationWindow,
  type UnmetReason,
} from "@/modules/learning-journey/domain/mission-rules";
import { gradeAnswers, toPublicQuestion, type PublicQuestion, type SubmittedAnswer } from "@/modules/learning-journey/domain/grading";
import {
  evaluateResume,
  summarizeCourseProgress,
  type CourseProgressSummary,
  type MissionProgressStatus,
} from "@/modules/learning-journey/domain/progress";
import {
  buildRewardIdempotencyKey,
  describeRewardDisplay,
  resolveRewardAmount,
  type RewardDisplay,
} from "@/modules/learning-journey/domain/reward-policy";

// 「はじまりの旅」のデータアクセス層。
//
// 判定ロジックは src/modules/learning-journey/domain/ の純粋関数に置き、ここは
// 「DBから引いてきて純粋関数へ渡し、結果を書き戻す」ことに徹する。
//
// 配置について: ADRでは modules/learning-journey/{domain,application,infrastructure}
// の4層を挙げたが、このリポジトリの既存コードは「データアクセスは src/lib/*.ts、
// 純粋関数は src/modules/*/domain/」で一貫している(castle-plots.ts / metaverse.ts 等)。
// 1機能だけ別構成にすると却って追いにくくなるため、依存方向(lib → domain の一方向)を
// 保ったうえで既存の作法に合わせている。指示書§4.3の「同等の依存方向を維持した代替構成」。

export type JourneyMissionSummary = {
  id: string;
  code: string;
  title: string;
  displayOrder: number;
  status: MissionProgressStatus;
  available: boolean;
  unavailableReason: string | null;
  reward: RewardDisplay;
};

export type JourneyOverview = {
  // 機能フラグOFF、または公開中のコースが無い場合はfalse。入口ごと出さない。
  enabled: boolean;
  course: { id: string; title: string; description: string | null } | null;
  // まだ登録していない場合はnull。自動登録はしない(指示書§9.2)。
  enrolled: boolean;
  progress: CourseProgressSummary | null;
  missions: JourneyMissionSummary[];
  // 再開期限・付与対象期間の案内(指示書§4.1)。
  resume: { canResume: boolean; rewardEligible: boolean; elapsedDays: number } | null;
};

const UNAVAILABLE_LABEL: Record<string, string> = {
  not_published: "準備中です",
  suspended: "現在お休みしています",
  before_start: "まもなく公開されます",
  after_end: "公開が終了しました",
};

function toWindow(row: { status: string; starts_at: string | null; ends_at: string | null }): PublicationWindow {
  return {
    status: row.status as PublicationWindow["status"],
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

function describeAvailability(availability: Availability): string | null {
  return availability.available ? null : (UNAVAILABLE_LABEL[availability.reason] ?? null);
}

// 公開中のコースを1本だけ返す。初期版は同時に1コースだけ動かす想定のため、
// 複数公開されていても display_order の先頭を採る。
async function getActiveCourseRow(now: Date) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("learning_journey_courses")
    .select("id, title, description, status, starts_at, ends_at")
    .eq("status", "published")
    .order("display_order", { ascending: true });
  if (error) throw error;

  return (data ?? []).find((course) => evaluateMissionAvailability(toWindow(course), toWindow(course), now).available) ?? null;
}

export async function getJourneyOverview(userId: string, now = new Date()): Promise<JourneyOverview> {
  const settings = await getLearningJourneySettings();
  const empty: JourneyOverview = {
    enabled: false,
    course: null,
    enrolled: false,
    progress: null,
    missions: [],
    resume: null,
  };
  if (!settings.missions_enabled) return empty;

  const course = await getActiveCourseRow(now);
  if (!course) return empty;

  const supabase = createSupabaseServerClient();
  const [{ data: missions, error: missionsError }, { data: enrollment, error: enrollmentError }] = await Promise.all([
    supabase
      .from("learning_journey_missions")
      .select("id, code, title, display_order, status, starts_at, ends_at, reward_amount")
      .eq("course_id", course.id)
      .order("display_order", { ascending: true }),
    supabase
      .from("learning_journey_enrollments")
      .select("id, started_at")
      .eq("course_id", course.id)
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .maybeSingle(),
  ]);
  if (missionsError) throw missionsError;
  if (enrollmentError) throw enrollmentError;

  const progressByMissionId = new Map<string, MissionProgressStatus>();
  if (enrollment) {
    const { data: progressRows, error: progressError } = await supabase
      .from("learning_journey_progress")
      .select("mission_id, status")
      .eq("enrollment_id", enrollment.id);
    if (progressError) throw progressError;
    for (const row of progressRows ?? []) {
      progressByMissionId.set(row.mission_id as string, row.status as MissionProgressStatus);
    }
  }

  const courseWindow = toWindow(course);
  const summaries: JourneyMissionSummary[] = (missions ?? []).map((mission) => {
    const availability = evaluateMissionAvailability(courseWindow, toWindow(mission), now);
    return {
      id: mission.id as string,
      code: mission.code as string,
      title: mission.title as string,
      displayOrder: mission.display_order as number,
      status: progressByMissionId.get(mission.id as string) ?? "not_started",
      available: availability.available,
      unavailableReason: describeAvailability(availability),
      reward: describeRewardDisplay(mission.reward_amount as number, settings.rewards_enabled),
    };
  });

  return {
    enabled: true,
    course: { id: course.id as string, title: course.title as string, description: course.description as string | null },
    enrolled: !!enrollment,
    progress: summarizeCourseProgress(
      summaries.map((mission) => ({
        missionId: mission.id,
        displayOrder: mission.displayOrder,
        status: mission.status,
        available: mission.available,
      }))
    ),
    missions: summaries,
    resume: enrollment
      ? evaluateResume(enrollment.started_at as string, now, {
          resumeWindowDays: settings.resume_window_days,
          rewardWindowDays: settings.reward_window_days,
        })
      : null,
  };
}

export class JourneyNotAvailableError extends Error {}

// コース登録。自動登録はせず、利用者が「はじめる」を押したときだけ作る
// (指示書§9.2「既存参加者向けの表示方針が確定するまでは自動登録しない」)。
export async function enrollInActiveCourse(userId: string, now = new Date()): Promise<string> {
  const settings = await getLearningJourneySettings();
  if (!settings.missions_enabled) throw new JourneyNotAvailableError("現在ご利用いただけません。");

  const course = await getActiveCourseRow(now);
  if (!course) throw new JourneyNotAvailableError("現在ご利用いただけるコースがありません。");

  const supabase = createSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .from("learning_journey_enrollments")
    .select("id")
    .eq("course_id", course.id)
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing.id as string;

  // 過去に登録して終えている場合は連番を進めて再登録する(指示書§7.2)。
  const { count, error: countError } = await supabase
    .from("learning_journey_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("course_id", course.id)
    .eq("user_id", userId);
  if (countError) throw countError;

  const { data, error } = await supabase
    .from("learning_journey_enrollments")
    .insert({ course_id: course.id, user_id: userId, enrollment_seq: (count ?? 0) + 1 })
    .select("id")
    .single();
  // 同時押しで一意制約に当たった場合は、既にできている行を返す。
  if (error) {
    const { data: retry } = await supabase
      .from("learning_journey_enrollments")
      .select("id")
      .eq("course_id", course.id)
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .maybeSingle();
    if (retry) return retry.id as string;
    throw error;
  }
  return data.id as string;
}

// ============================================================
// ミッション詳細
// ============================================================

export type JourneyMissionDetail = {
  id: string;
  title: string;
  available: boolean;
  unavailableReason: string | null;
  status: MissionProgressStatus;
  contentVersionId: string;
  bodyText: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  videoAltText: string | null;
  questions: PublicQuestion[];
  // 途中再開のため、既に送った回答を返す。
  savedAnswers: { questionId: string; choiceIds: string[]; freeText: string | null }[];
  // 自己申告での完了を提示するか(外部実績APIが未整備のため)。
  allowSelfReport: boolean;
  reward: RewardDisplay;
};

type MissionRow = {
  id: string;
  course_id: string;
  title: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  require_content_viewed: boolean;
  require_all_questions_answered: boolean;
  min_correct_answers: number;
  require_external_achievement: boolean;
  allow_self_report: boolean;
  reward_amount: number;
  self_report_reward_amount: number | null;
};

const MISSION_COLUMNS =
  "id, course_id, title, status, starts_at, ends_at, require_content_viewed, require_all_questions_answered, min_correct_answers, require_external_achievement, allow_self_report, reward_amount, self_report_reward_amount";

function toCompletionRule(mission: MissionRow): MissionCompletionRule {
  return {
    requireContentViewed: mission.require_content_viewed,
    requireAllQuestionsAnswered: mission.require_all_questions_answered,
    minCorrectAnswers: mission.min_correct_answers,
    requireExternalAchievement: mission.require_external_achievement,
    allowSelfReport: mission.allow_self_report,
  };
}

// 教材の最新公開バージョン。公開済みが1件も無ければ、そのミッションはまだ出せない。
async function getPublishedContentVersion(missionId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("learning_journey_content_versions")
    .select("id, body_text, video_url, image_url, video_alt_text")
    .eq("mission_id", missionId)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getEnrollmentId(userId: string, courseId: string): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("learning_journey_enrollments")
    .select("id")
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string) ?? null;
}

export async function getMissionDetail(
  userId: string,
  missionId: string,
  now = new Date()
): Promise<JourneyMissionDetail | null> {
  const settings = await getLearningJourneySettings();
  if (!settings.missions_enabled) return null;

  const supabase = createSupabaseServerClient();
  const { data: mission, error: missionError } = await supabase
    .from("learning_journey_missions")
    .select(MISSION_COLUMNS)
    .eq("id", missionId)
    .maybeSingle<MissionRow>();
  if (missionError) throw missionError;
  if (!mission) return null;

  const { data: course, error: courseError } = await supabase
    .from("learning_journey_courses")
    .select("id, status, starts_at, ends_at")
    .eq("id", mission.course_id)
    .maybeSingle();
  if (courseError) throw courseError;
  if (!course) return null;

  const version = await getPublishedContentVersion(missionId);
  if (!version) return null;

  const { data: questions, error: questionsError } = await supabase
    .from("learning_journey_questions")
    .select("id, question_type, is_required, body, display_order, learning_journey_choices(id, body, is_correct, display_order)")
    .eq("content_version_id", version.id)
    .order("display_order", { ascending: true });
  if (questionsError) throw questionsError;

  const enrollmentId = await getEnrollmentId(userId, mission.course_id);

  let status: MissionProgressStatus = "not_started";
  let savedAnswers: JourneyMissionDetail["savedAnswers"] = [];
  if (enrollmentId) {
    const [{ data: progress }, { data: answers, error: answersError }] = await Promise.all([
      supabase
        .from("learning_journey_progress")
        .select("status")
        .eq("enrollment_id", enrollmentId)
        .eq("mission_id", missionId)
        .maybeSingle(),
      supabase
        .from("learning_journey_answers")
        .select("question_id, choice_id, free_text")
        .eq("enrollment_id", enrollmentId)
        .eq("mission_id", missionId),
    ]);
    if (answersError) throw answersError;
    status = (progress?.status as MissionProgressStatus) ?? "not_started";

    const byQuestion = new Map<string, { questionId: string; choiceIds: string[]; freeText: string | null }>();
    for (const row of answers ?? []) {
      const questionId = row.question_id as string;
      const entry = byQuestion.get(questionId) ?? { questionId, choiceIds: [], freeText: null };
      if (row.choice_id) entry.choiceIds.push(row.choice_id as string);
      if (row.free_text) entry.freeText = row.free_text as string;
      byQuestion.set(questionId, entry);
    }
    savedAnswers = Array.from(byQuestion.values());
  }

  const availability = evaluateMissionAvailability(toWindow(course), toWindow(mission), now);

  return {
    id: mission.id,
    title: mission.title,
    available: availability.available,
    unavailableReason: describeAvailability(availability),
    status,
    contentVersionId: version.id as string,
    bodyText: version.body_text as string | null,
    videoUrl: version.video_url as string | null,
    imageUrl: version.image_url as string | null,
    videoAltText: version.video_alt_text as string | null,
    // toPublicQuestion で正解フラグを落とす(指示書§11)。
    questions: (questions ?? []).map((question) =>
      toPublicQuestion({
        id: question.id as string,
        question_type: question.question_type as string,
        is_required: question.is_required as boolean,
        body: question.body as string,
        choices: ((question.learning_journey_choices ?? []) as { id: string; body: string; is_correct: boolean; display_order: number }[])
          .slice()
          .sort((a, b) => a.display_order - b.display_order)
          .map((choice) => ({ id: choice.id, body: choice.body, is_correct: choice.is_correct })),
      })
    ),
    savedAnswers,
    allowSelfReport: mission.require_external_achievement && mission.allow_self_report,
    reward: describeRewardDisplay(mission.reward_amount, settings.rewards_enabled),
  };
}

// 教材を表示したことを記録する。完了条件の一つ(指示書§6の「教材表示」)。
export async function recordContentViewed(userId: string, missionId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data: mission, error } = await supabase
    .from("learning_journey_missions")
    .select("id, course_id")
    .eq("id", missionId)
    .maybeSingle();
  if (error) throw error;
  if (!mission) return;

  const enrollmentId = await getEnrollmentId(userId, mission.course_id as string);
  if (!enrollmentId) return;

  const nowIso = new Date().toISOString();
  // 既に完了しているミッションの状態を in_progress へ戻さない。
  const { error: upsertError } = await supabase.from("learning_journey_progress").upsert(
    {
      enrollment_id: enrollmentId,
      mission_id: missionId,
      status: "in_progress",
      content_viewed_at: nowIso,
      started_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "enrollment_id,mission_id", ignoreDuplicates: true }
  );
  if (upsertError) throw upsertError;

  // 既存行がある場合は content_viewed_at だけを埋める(未設定のときのみ)。
  const { error: updateError } = await supabase
    .from("learning_journey_progress")
    .update({ content_viewed_at: nowIso, updated_at: nowIso })
    .eq("enrollment_id", enrollmentId)
    .eq("mission_id", missionId)
    .is("content_viewed_at", null);
  if (updateError) throw updateError;
}

// ============================================================
// 回答送信と完了判定
// ============================================================

export type SubmitAnswersResult = {
  completed: boolean;
  source: CompletionSource;
  unmet: UnmetReason[];
  // 採点対象の設問について、正解できたかどうか(正解そのものは返さない)。
  graded: { questionId: string; isCorrect: boolean | null }[];
};

export class JourneyAnswerRejectedError extends Error {}

export async function submitAnswers(
  userId: string,
  missionId: string,
  answers: SubmittedAnswer[],
  options: { selfReported?: boolean } = {},
  now = new Date()
): Promise<SubmitAnswersResult> {
  const settings = await getLearningJourneySettings();
  if (!settings.missions_enabled) throw new JourneyNotAvailableError("現在ご利用いただけません。");

  const supabase = createSupabaseServerClient();
  const { data: mission, error: missionError } = await supabase
    .from("learning_journey_missions")
    .select(MISSION_COLUMNS)
    .eq("id", missionId)
    .maybeSingle<MissionRow>();
  if (missionError) throw missionError;
  if (!mission) throw new JourneyAnswerRejectedError("ミッションが見つかりません。");

  const { data: course, error: courseError } = await supabase
    .from("learning_journey_courses")
    .select("id, status, starts_at, ends_at")
    .eq("id", mission.course_id)
    .maybeSingle();
  if (courseError) throw courseError;
  if (!course) throw new JourneyAnswerRejectedError("ミッションが見つかりません。");

  const availability = evaluateMissionAvailability(toWindow(course), toWindow(mission), now);
  if (!availability.available) {
    throw new JourneyNotAvailableError(describeAvailability(availability) ?? "現在ご利用いただけません。");
  }

  const enrollmentId = await getEnrollmentId(userId, mission.course_id);
  if (!enrollmentId) throw new JourneyAnswerRejectedError("先に「はじめる」を押してください。");

  const version = await getPublishedContentVersion(missionId);
  if (!version) throw new JourneyAnswerRejectedError("教材が公開されていません。");

  // 採点には正解が必要なので、ここでだけ is_correct を読む。
  const { data: questionRows, error: questionsError } = await supabase
    .from("learning_journey_questions")
    .select("id, question_type, is_required, learning_journey_choices(id, is_correct)")
    .eq("content_version_id", version.id);
  if (questionsError) throw questionsError;

  const questions = (questionRows ?? []).map((question) => {
    const choices = (question.learning_journey_choices ?? []) as { id: string; is_correct: boolean }[];
    return {
      id: question.id as string,
      questionType: question.question_type as "quiz" | "single" | "multi" | "free_text",
      isRequired: question.is_required as boolean,
      choiceIds: choices.map((choice) => choice.id),
      correctChoiceIds: choices.filter((choice) => choice.is_correct).map((choice) => choice.id),
    };
  });

  const grading = gradeAnswers(questions, answers);
  if (grading.unknownQuestionIds.length > 0 || grading.invalidChoiceQuestionIds.length > 0) {
    // 教材が新しいバージョンへ差し替わった後、古い画面から送られてきた場合に起こる。
    throw new JourneyAnswerRejectedError("教材が更新されています。画面を開き直してください。");
  }

  await persistAnswers(enrollmentId, missionId, version.id as string, questions, answers, grading);

  const { data: progress } = await supabase
    .from("learning_journey_progress")
    .select("content_viewed_at")
    .eq("enrollment_id", enrollmentId)
    .eq("mission_id", missionId)
    .maybeSingle();

  const evaluation = evaluateMissionCompletion(toCompletionRule(mission), {
    contentViewed: !!progress?.content_viewed_at,
    requiredQuestionCount: grading.requiredQuestionCount,
    answeredRequiredQuestionCount: grading.answeredRequiredQuestionCount,
    correctAnswerCount: grading.correctAnswerCount,
    // 外部サービスの体験実績APIは未整備。整備されるまで常にfalseで、
    // 自己申告(SELF_REPORTED)でのみ完了できる(指示書§6)。
    externalAchievementVerified: false,
    selfReported: !!options.selfReported,
  });

  const nowIso = now.toISOString();
  if (evaluation.completed) {
    await completeMission(enrollmentId, missionId, version.id as string, mission, evaluation.source, userId, nowIso);
  } else {
    await supabase
      .from("learning_journey_progress")
      .update({ status: "in_progress", updated_at: nowIso })
      .eq("enrollment_id", enrollmentId)
      .eq("mission_id", missionId)
      .neq("status", "completed");
  }

  return {
    completed: evaluation.completed,
    source: evaluation.source,
    unmet: evaluation.unmet,
    graded: grading.perQuestion.map((grade) => ({ questionId: grade.questionId, isCorrect: grade.isCorrect })),
  };
}

// 回答の保存。同じ設問へ同じ選択肢を再送しても行が増えないよう、
// (enrollment_id, question_id, choice_id) の一意制約に載せる。
// 選び直しに対応するため、対象の設問の既存回答を消してから入れ直す。
async function persistAnswers(
  enrollmentId: string,
  missionId: string,
  contentVersionId: string,
  questions: { id: string; questionType: string; correctChoiceIds: string[] }[],
  answers: SubmittedAnswer[],
  grading: ReturnType<typeof gradeAnswers>
): Promise<void> {
  if (answers.length === 0) return;

  const supabase = createSupabaseServerClient();
  const correctByQuestionId = new Map(grading.perQuestion.map((grade) => [grade.questionId, grade.isCorrect]));
  const questionById = new Map(questions.map((question) => [question.id, question]));

  const answeredQuestionIds = answers.map((answer) => answer.questionId);
  const { error: deleteError } = await supabase
    .from("learning_journey_answers")
    .delete()
    .eq("enrollment_id", enrollmentId)
    .in("question_id", answeredQuestionIds);
  if (deleteError) throw deleteError;

  type AnswerRow = {
    enrollment_id: string;
    mission_id: string;
    content_version_id: string;
    question_id: string;
    is_correct: boolean | null;
    choice_id: string | null;
    free_text: string | null;
  };

  const rows = answers.flatMap<AnswerRow>((answer) => {
    const question = questionById.get(answer.questionId);
    if (!question) return [];
    const base = {
      enrollment_id: enrollmentId,
      mission_id: missionId,
      content_version_id: contentVersionId,
      question_id: answer.questionId,
      is_correct: correctByQuestionId.get(answer.questionId) ?? null,
    };
    if (question.questionType === "free_text") {
      const text = (answer.freeText ?? "").trim();
      return text.length > 0 ? [{ ...base, choice_id: null, free_text: text }] : [];
    }
    return answer.choiceIds.map((choiceId) => ({ ...base, choice_id: choiceId, free_text: null }));
  });

  if (rows.length === 0) return;
  const { error } = await supabase.from("learning_journey_answers").insert(rows);
  if (error) throw error;
}

// 完了の確定。Supabase JSからは複数文にトランザクションを張れないため、
// 完了イベントの unique (enrollment_id, mission_id) と付与要求の
// unique (completion_event_id) で二重作成を防ぐ。途中で失敗しても、
// 同じ回答を再送すれば同じ状態へ収束する。
async function completeMission(
  enrollmentId: string,
  missionId: string,
  contentVersionId: string,
  mission: MissionRow,
  source: CompletionSource,
  userId: string,
  nowIso: string
): Promise<void> {
  const supabase = createSupabaseServerClient();

  const { data: claimed, error: eventError } = await supabase
    .from("learning_journey_completion_events")
    .upsert(
      {
        enrollment_id: enrollmentId,
        mission_id: missionId,
        content_version_id: contentVersionId,
        completion_source: source,
        completed_at: nowIso,
      },
      { onConflict: "enrollment_id,mission_id", ignoreDuplicates: true }
    )
    .select("id");
  if (eventError) throw eventError;

  const { error: progressError } = await supabase
    .from("learning_journey_progress")
    .update({ status: "completed", completed_at: nowIso, updated_at: nowIso })
    .eq("enrollment_id", enrollmentId)
    .eq("mission_id", missionId);
  if (progressError) throw progressError;

  // 既に完了していた場合、upsertは行を返さない。付与要求も作らない。
  const completionEventId = (claimed ?? [])[0]?.id as string | undefined;
  if (!completionEventId) return;

  await createRewardRequest(completionEventId, userId, mission, source);
  await maybeCompleteEnrollment(enrollmentId, nowIso);
}

// 付与要求は完了と同時に PENDING で作る。送信はPR5。
// ウォレットが本番稼働していない間は PENDING のまま溜まり、稼働後にまとめて送れる
// (ADR-5、指示書§8.1の選択肢1「付与要求のみ記録し、Wallet整備・接続後に送信する」)。
async function createRewardRequest(
  completionEventId: string,
  userId: string,
  mission: MissionRow,
  source: CompletionSource
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const amount = resolveRewardAmount(
    { rewardAmount: mission.reward_amount, selfReportRewardAmount: mission.self_report_reward_amount },
    source
  );

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("common_user_id")
    .eq("id", userId)
    .maybeSingle();
  if (userError) throw userError;

  const { error } = await supabase.from("learning_journey_reward_requests").insert({
    completion_event_id: completionEventId,
    user_id: userId,
    // ADR-6: ウォレットへ送るのは users.id。一度送るとリネームできないため、
    // ここで確定させて以後書き換えない。
    external_user_id: userId,
    common_user_id: user?.common_user_id ?? null,
    amount,
    completion_source: source,
    idempotency_key: buildRewardIdempotencyKey(completionEventId),
  });
  // 同時送信で一意制約に当たった場合は、既に作られているので何もしない。
  if (error && !error.message?.includes("duplicate key")) throw error;
}

// 全ミッションが完了していればコース登録自体を完了にする。
async function maybeCompleteEnrollment(enrollmentId: string, nowIso: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data: enrollment, error: enrollmentError } = await supabase
    .from("learning_journey_enrollments")
    .select("course_id")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (enrollmentError) throw enrollmentError;
  if (!enrollment) return;

  const [{ count: missionCount }, { count: completedCount }] = await Promise.all([
    supabase
      .from("learning_journey_missions")
      .select("id", { count: "exact", head: true })
      .eq("course_id", enrollment.course_id)
      .eq("status", "published"),
    supabase
      .from("learning_journey_completion_events")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollmentId),
  ]);

  if ((missionCount ?? 0) > 0 && (completedCount ?? 0) >= (missionCount ?? 0)) {
    const { error } = await supabase
      .from("learning_journey_enrollments")
      .update({ status: "completed", completed_at: nowIso, updated_at: nowIso })
      .eq("id", enrollmentId)
      .eq("status", "in_progress");
    if (error) throw error;
  }
}

// ============================================================
// 進捗画面(獲得予定・付与済みの区別)
// ============================================================

export type JourneyRewardRow = {
  missionTitle: string;
  amount: number;
  status: string;
  completedAt: string;
};

export type JourneyProgressDetail = {
  enabled: boolean;
  rewardsEnabled: boolean;
  missions: JourneyMissionSummary[];
  progress: CourseProgressSummary | null;
  rewards: JourneyRewardRow[];
};

export async function getJourneyProgressDetail(userId: string, now = new Date()): Promise<JourneyProgressDetail> {
  const settings = await getLearningJourneySettings();
  const overview = await getJourneyOverview(userId, now);
  if (!overview.enabled || !overview.course) {
    return { enabled: false, rewardsEnabled: false, missions: [], progress: null, rewards: [] };
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("learning_journey_reward_requests")
    .select(
      "amount, status, created_at, learning_journey_completion_events(completed_at, learning_journey_missions(title))"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rewards: JourneyRewardRow[] = (data ?? []).map((row) => {
    const event = row.learning_journey_completion_events as unknown as
      | { completed_at: string; learning_journey_missions: { title: string } | null }
      | null;
    return {
      missionTitle: event?.learning_journey_missions?.title ?? "ミッション",
      amount: row.amount as number,
      status: row.status as string,
      completedAt: event?.completed_at ?? (row.created_at as string),
    };
  });

  return {
    enabled: true,
    rewardsEnabled: settings.rewards_enabled,
    missions: overview.missions,
    progress: overview.progress,
    rewards,
  };
}
