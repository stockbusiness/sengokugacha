import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminRole, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { getLearningJourneySettings, updateLearningJourneySettings } from "@/lib/learning-journey-settings";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getLearningJourneySettings());
}

const BOOLEAN_FIELDS = [
  "missions_enabled",
  "rewards_enabled",
  "consultation_sync_enabled",
  "line_notifications_enabled",
] as const;

const NUMERIC_FIELDS = [
  "course_reward_cap",
  "period_reward_cap",
  "per_request_reward_cap",
  "stale_reward_minutes",
  "resume_window_days",
  "reward_window_days",
] as const;

// 機能フラグ・付与上限・滞留判定時間の変更。
// 指示書§11「付与上限の設定変更、上限保留解除、取消取引IDの登録を監査ログへ残す」
// 「staging実証では、付与上限変更、LIMIT_HELD解除、取消・訂正、緊急停止を
// managerロール限定とし、サーバー側で権限を検証する。実行者名と操作理由を必須とする」。
export async function PATCH(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "この操作は本部管理者のみ実行できます" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length === 0) {
    return NextResponse.json({ error: "操作理由を入力してください" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const field of BOOLEAN_FIELDS) {
    if (typeof body[field] === "boolean") update[field] = body[field];
  }
  for (const field of NUMERIC_FIELDS) {
    if (Number.isInteger(body[field]) && body[field] >= 0) update[field] = body[field];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "変更する項目がありません" }, { status: 400 });
  }

  const before = await getLearningJourneySettings();
  const after = await updateLearningJourneySettings(update);

  await logAdminAction(
    await getAdminActorName(),
    "learning_journey_settings_update",
    Object.keys(update).join(", "),
    { targetType: "learning_journey_settings", targetId: after.id ?? "new", before, after },
    { adminRole: await getAdminRole(), operationReason: reason, requestId: crypto.randomUUID() }
  );

  return NextResponse.json(after);
}
