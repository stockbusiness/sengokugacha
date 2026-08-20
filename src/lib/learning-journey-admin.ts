import { createSupabaseServerClient } from "@/lib/supabase-server";
import { detectAnomalies, describeAnomaly } from "@/modules/learning-journey/domain/anomaly";
import { checkRewardCaps } from "@/modules/learning-journey/domain/reward-policy";
import { getLearningJourneySettings } from "@/lib/learning-journey-settings";

// 「はじまりの旅」管理画面のデータアクセス層。
// 参加者向け(src/lib/learning-journey.ts)とは読む範囲も権限も違うため分けている。

// ============================================================
// コース・ミッション・教材
// ============================================================

export type AdminCourse = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  display_order: number;
  missionCount: number;
};

export async function listCourses(): Promise<AdminCourse[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("learning_journey_courses")
    .select("id, code, title, description, status, starts_at, ends_at, display_order")
    .order("display_order", { ascending: true });
  if (error) throw error;

  const courses = data ?? [];
  if (courses.length === 0) return [];

  const { data: missions, error: missionsError } = await supabase
    .from("learning_journey_missions")
    .select("course_id")
    .in("course_id", courses.map((course) => course.id));
  if (missionsError) throw missionsError;

  const countByCourse = new Map<string, number>();
  for (const mission of missions ?? []) {
    const courseId = mission.course_id as string;
    countByCourse.set(courseId, (countByCourse.get(courseId) ?? 0) + 1);
  }

  return courses.map((course) => ({ ...course, missionCount: countByCourse.get(course.id) ?? 0 }) as AdminCourse);
}

export type AdminMission = {
  id: string;
  code: string;
  title: string;
  display_order: number;
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
  // 公開済みの教材バージョンがあるか。無ければ参加者に出ない。
  publishedVersion: number | null;
  draftVersion: number | null;
};

export async function listMissions(courseId: string): Promise<AdminMission[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("learning_journey_missions")
    .select("*")
    .eq("course_id", courseId)
    .order("display_order", { ascending: true });
  if (error) throw error;

  const missions = data ?? [];
  if (missions.length === 0) return [];

  const { data: versions, error: versionsError } = await supabase
    .from("learning_journey_content_versions")
    .select("mission_id, version, status")
    .in("mission_id", missions.map((mission) => mission.id));
  if (versionsError) throw versionsError;

  const published = new Map<string, number>();
  const draft = new Map<string, number>();
  for (const version of versions ?? []) {
    const target = version.status === "published" ? published : version.status === "draft" ? draft : null;
    if (!target) continue;
    const missionId = version.mission_id as string;
    target.set(missionId, Math.max(target.get(missionId) ?? 0, version.version as number));
  }

  return missions.map((mission) => ({
    ...mission,
    publishedVersion: published.get(mission.id as string) ?? null,
    draftVersion: draft.get(mission.id as string) ?? null,
  })) as AdminMission[];
}

export type AdminContentVersion = {
  id: string;
  version: number;
  status: string;
  body_text: string | null;
  video_url: string | null;
  image_url: string | null;
  video_alt_text: string | null;
  published_at: string | null;
  questions: {
    id: string;
    display_order: number;
    question_type: string;
    body: string;
    is_required: boolean;
    choices: { id: string; display_order: number; body: string; is_correct: boolean }[];
  }[];
};

// 管理画面では正解フラグも返す(設定するために必要)。参加者向けAPIとは別経路。
export async function getMissionContent(missionId: string): Promise<AdminContentVersion[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("learning_journey_content_versions")
    .select(
      "id, version, status, body_text, video_url, image_url, video_alt_text, published_at, learning_journey_questions(id, display_order, question_type, body, is_required, learning_journey_choices(id, display_order, body, is_correct))"
    )
    .eq("mission_id", missionId)
    .order("version", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((version) => ({
    id: version.id as string,
    version: version.version as number,
    status: version.status as string,
    body_text: version.body_text as string | null,
    video_url: version.video_url as string | null,
    image_url: version.image_url as string | null,
    video_alt_text: version.video_alt_text as string | null,
    published_at: version.published_at as string | null,
    questions: (
      (version.learning_journey_questions ?? []) as {
        id: string;
        display_order: number;
        question_type: string;
        body: string;
        is_required: boolean;
        learning_journey_choices: { id: string; display_order: number; body: string; is_correct: boolean }[];
      }[]
    )
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((question) => ({
        id: question.id,
        display_order: question.display_order,
        question_type: question.question_type,
        body: question.body,
        is_required: question.is_required,
        choices: (question.learning_journey_choices ?? [])
          .slice()
          .sort((a, b) => a.display_order - b.display_order),
      })),
  }));
}

export class JourneyAdminRejectedError extends Error {}

// 新しい下書きバージョンを作る。ADR-3のとおり公開済みは書き換えず、常に版を足す。
// 直近のバージョンの内容と設問・選択肢を複製して出発点にする(誤字修正のたびに
// 全部作り直すのは現実的でないため)。
export async function createDraftVersion(missionId: string): Promise<string> {
  const supabase = createSupabaseServerClient();
  const versions = await getMissionContent(missionId);

  const existingDraft = versions.find((version) => version.status === "draft");
  if (existingDraft) throw new JourneyAdminRejectedError("すでに下書きがあります。先に公開するか破棄してください。");

  const latest = versions[0] ?? null;
  const nextVersion = (latest?.version ?? 0) + 1;

  const { data: created, error } = await supabase
    .from("learning_journey_content_versions")
    .insert({
      mission_id: missionId,
      version: nextVersion,
      status: "draft",
      body_text: latest?.body_text ?? null,
      video_url: latest?.video_url ?? null,
      image_url: latest?.image_url ?? null,
      video_alt_text: latest?.video_alt_text ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  // 設問と選択肢も複製する。
  for (const question of latest?.questions ?? []) {
    const { data: newQuestion, error: questionError } = await supabase
      .from("learning_journey_questions")
      .insert({
        content_version_id: created.id,
        display_order: question.display_order,
        question_type: question.question_type,
        body: question.body,
        is_required: question.is_required,
      })
      .select("id")
      .single();
    if (questionError) throw questionError;

    if (question.choices.length > 0) {
      const { error: choicesError } = await supabase.from("learning_journey_choices").insert(
        question.choices.map((choice) => ({
          question_id: newQuestion.id,
          display_order: choice.display_order,
          body: choice.body,
          is_correct: choice.is_correct,
        }))
      );
      if (choicesError) throw choicesError;
    }
  }

  return created.id as string;
}

// 下書きを公開する。同じミッションの既存の公開版はarchivedへ回す
// (参加者は常に最新の公開版を見る。過去の回答は content_version_id で辿れるため
// archivedにしても再現性は保たれる)。
export async function publishVersion(versionId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data: version, error } = await supabase
    .from("learning_journey_content_versions")
    .select("id, mission_id, status")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw error;
  if (!version) throw new JourneyAdminRejectedError("バージョンが見つかりません。");
  if (version.status !== "draft") throw new JourneyAdminRejectedError("下書きのバージョンだけを公開できます。");

  const { error: archiveError } = await supabase
    .from("learning_journey_content_versions")
    .update({ status: "archived" })
    .eq("mission_id", version.mission_id)
    .eq("status", "published");
  if (archiveError) throw archiveError;

  const { error: publishError } = await supabase
    .from("learning_journey_content_versions")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", versionId);
  if (publishError) throw publishError;
}

// ============================================================
// ユーザー別進捗
// ============================================================

export type AdminEnrollmentRow = {
  enrollmentId: string;
  userId: string;
  displayName: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  completedMissions: number;
  // 指示書§11。検知・表示のみで自動遮断しない。
  anomalies: string[];
};

export async function listEnrollments(courseId: string | null): Promise<AdminEnrollmentRow[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("learning_journey_enrollments")
    .select("id, user_id, status, started_at, completed_at, users(display_name)")
    .order("started_at", { ascending: false })
    .limit(500);
  if (courseId) query = query.eq("course_id", courseId);

  const { data, error } = await query;
  if (error) throw error;

  const enrollments = data ?? [];
  if (enrollments.length === 0) return [];
  const enrollmentIds = enrollments.map((enrollment) => enrollment.id as string);

  const [{ data: completions, error: completionsError }, { data: answers, error: answersError }] = await Promise.all([
    supabase
      .from("learning_journey_completion_events")
      .select("enrollment_id, mission_id, completed_at")
      .in("enrollment_id", enrollmentIds),
    supabase
      .from("learning_journey_answers")
      .select("enrollment_id, free_text")
      .in("enrollment_id", enrollmentIds)
      .not("free_text", "is", null),
  ]);
  if (completionsError) throw completionsError;
  if (answersError) throw answersError;

  const completionsByEnrollment = new Map<string, { missionId: string; completedAt: string }[]>();
  for (const row of completions ?? []) {
    const key = row.enrollment_id as string;
    const list = completionsByEnrollment.get(key) ?? [];
    list.push({ missionId: row.mission_id as string, completedAt: row.completed_at as string });
    completionsByEnrollment.set(key, list);
  }

  const freeTextsByEnrollment = new Map<string, string[]>();
  for (const row of answers ?? []) {
    const key = row.enrollment_id as string;
    const list = freeTextsByEnrollment.get(key) ?? [];
    list.push(row.free_text as string);
    freeTextsByEnrollment.set(key, list);
  }

  return enrollments.map((enrollment) => {
    const id = enrollment.id as string;
    const enrollmentCompletions = completionsByEnrollment.get(id) ?? [];
    const signals = detectAnomalies({
      completions: enrollmentCompletions,
      freeTexts: freeTextsByEnrollment.get(id) ?? [],
    });
    return {
      enrollmentId: id,
      userId: enrollment.user_id as string,
      displayName: (enrollment.users as unknown as { display_name: string | null } | null)?.display_name ?? null,
      status: enrollment.status as string,
      startedAt: enrollment.started_at as string,
      completedAt: enrollment.completed_at as string | null,
      completedMissions: enrollmentCompletions.length,
      anomalies: signals.map(describeAnomaly),
    };
  });
}

// ============================================================
// 付与要求
// ============================================================

export type AdminRewardRow = {
  id: string;
  userId: string;
  displayName: string | null;
  missionTitle: string | null;
  amount: number;
  status: string;
  completionSource: string;
  commonUserId: string | null;
  attemptCount: number;
  lastError: string | null;
  walletTransactionId: string | null;
  createdAt: string;
  // 指示書§8.3「PENDING/PROCESSINGが設定時間を超えた場合は要対応一覧へ表示する」。
  stale: boolean;
};

export type AdminRewardSummary = {
  // 指示書§4.2「付与総量の上限設定、使用状況、上限到達状況の表示」。
  succeededTotal: number;
  inFlightTotal: number;
  limitHeldTotal: number;
  courseCap: number;
  periodCap: number;
  // いま1件付与しようとしたら上限に触れるか。
  capReached: boolean;
  staleCount: number;
};

export async function listRewardRequests(): Promise<{ rows: AdminRewardRow[]; summary: AdminRewardSummary }> {
  const settings = await getLearningJourneySettings();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("learning_journey_reward_requests")
    .select(
      "id, user_id, amount, status, completion_source, common_user_id, attempt_count, last_error, wallet_transaction_id, created_at, users(display_name), learning_journey_completion_events(learning_journey_missions(title))"
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const staleBefore = Date.now() - settings.stale_reward_minutes * 60 * 1000;

  const rows: AdminRewardRow[] = (data ?? []).map((row) => {
    const status = row.status as string;
    const createdAt = row.created_at as string;
    const event = row.learning_journey_completion_events as unknown as
      | { learning_journey_missions: { title: string } | null }
      | null;
    return {
      id: row.id as string,
      userId: row.user_id as string,
      displayName: (row.users as unknown as { display_name: string | null } | null)?.display_name ?? null,
      missionTitle: event?.learning_journey_missions?.title ?? null,
      amount: row.amount as number,
      status,
      completionSource: row.completion_source as string,
      commonUserId: row.common_user_id as string | null,
      attemptCount: row.attempt_count as number,
      lastError: row.last_error as string | null,
      walletTransactionId: row.wallet_transaction_id as string | null,
      createdAt,
      stale:
        (status === "PENDING" || status === "PROCESSING") && new Date(createdAt).getTime() < staleBefore,
    };
  });

  const sum = (predicate: (row: AdminRewardRow) => boolean) =>
    rows.filter(predicate).reduce((total, row) => total + row.amount, 0);

  const succeededTotal = sum((row) => row.status === "SUCCEEDED");
  const inFlightTotal = sum((row) => row.status === "PENDING" || row.status === "PROCESSING");
  const limitHeldTotal = sum((row) => row.status === "LIMIT_HELD");

  // 「いま1円でも付与できるか」で上限到達を判定する。
  const capReached = !checkRewardCaps(1, {
    perRequestCap: settings.per_request_reward_cap,
    courseCap: settings.course_reward_cap,
    courseGranted: succeededTotal,
    periodCap: settings.period_reward_cap,
    periodGranted: succeededTotal,
  }).allowed;

  return {
    rows,
    summary: {
      succeededTotal,
      inFlightTotal,
      limitHeldTotal,
      courseCap: settings.course_reward_cap,
      periodCap: settings.period_reward_cap,
      capReached,
      staleCount: rows.filter((row) => row.stale).length,
    },
  };
}

export type RewardAdminAction = "retry" | "cancel" | "reverse" | "release";

// 付与要求への管理者操作。実際のWallet送信はPR5で、ここでは状態遷移だけを行う。
//
// 指示書§8.3「CANCELLED はWalletへ未送信の要求を管理者が無効化した状態、
// REVERSED はWallet側で正式な取消処理が完了した状態。REVERSEDにはWalletの
// 取消取引IDを保存し、パスポート側だけで送信済み取引の状態を変更しない。
// いずれも自動遷移させず、管理者操作と監査ログを必須とする」。
export async function applyRewardAction(
  requestId: string,
  action: RewardAdminAction,
  options: { walletReversalTransactionId?: string | null } = {}
): Promise<{ before: string; after: string }> {
  const supabase = createSupabaseServerClient();
  const { data: current, error } = await supabase
    .from("learning_journey_reward_requests")
    .select("id, status, wallet_transaction_id")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!current) throw new JourneyAdminRejectedError("付与要求が見つかりません。");

  const before = current.status as string;
  let after: string;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  switch (action) {
    case "retry":
      // 失敗した要求を再送待ちへ戻す。実際の送信はPR5。
      if (before !== "FAILED") throw new JourneyAdminRejectedError("失敗した要求だけを再実行できます。");
      after = "PENDING";
      update.last_error = null;
      break;
    case "release":
      // 上限保留を解除して再送待ちへ戻す。上限そのものは設定画面で変更する。
      if (before !== "LIMIT_HELD") throw new JourneyAdminRejectedError("上限保留中の要求だけを解除できます。");
      after = "PENDING";
      break;
    case "cancel":
      // Walletへ未送信のものだけ無効化できる。送信済みの取消はreverseで行う。
      if (!["PENDING", "FAILED", "LIMIT_HELD"].includes(before)) {
        throw new JourneyAdminRejectedError("未送信の要求だけを取り消せます。");
      }
      if (current.wallet_transaction_id) {
        throw new JourneyAdminRejectedError("Walletへ送信済みの要求は取り消せません。訂正記録をご利用ください。");
      }
      after = "CANCELLED";
      break;
    case "reverse":
      // Wallet側で取消が完了したことの記録。取消取引IDが無ければ受け付けない。
      if (before !== "SUCCEEDED") throw new JourneyAdminRejectedError("付与済みの要求だけを訂正できます。");
      if (!options.walletReversalTransactionId) {
        throw new JourneyAdminRejectedError("Wallet側の取消取引IDが必要です。");
      }
      after = "REVERSED";
      update.wallet_reversal_transaction_id = options.walletReversalTransactionId;
      break;
  }

  update.status = after;
  const { error: updateError } = await supabase
    .from("learning_journey_reward_requests")
    .update(update)
    .eq("id", requestId)
    // 読んでから書くまでに他の管理者が動かしていたら弾く。
    .eq("status", before);
  if (updateError) throw updateError;

  return { before, after };
}
