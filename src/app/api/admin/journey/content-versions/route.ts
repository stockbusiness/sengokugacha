import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminRole, getAdminSession } from "@/lib/admin-session";
import { createDraftVersion, JourneyAdminRejectedError } from "@/lib/learning-journey-admin";

// 新しい下書きバージョンを作る。ADR-3のとおり公開済みは書き換えない。
export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const missionId = typeof body?.mission_id === "string" ? body.mission_id : "";
  if (!missionId) return NextResponse.json({ error: "mission_id は必須です" }, { status: 400 });

  try {
    const id = await createDraftVersion(missionId);
    await logAdminAction(await getAdminActorName(), "learning_journey_content_version_create", `mission_id=${missionId}`,
      { targetType: "learning_journey_content_version", targetId: id },
      { adminRole: await getAdminRole() });
    return NextResponse.json({ id });
  } catch (error) {
    if (error instanceof JourneyAdminRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("教材バージョンの作成に失敗しました", error);
    return NextResponse.json({ error: "作成に失敗しました。" }, { status: 500 });
  }
}
