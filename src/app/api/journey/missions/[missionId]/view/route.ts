import { NextResponse } from "next/server";
import { recordContentViewed } from "@/lib/learning-journey";
import { getSession } from "@/lib/session";

// 教材を表示したことの記録。完了条件の一つ(指示書§6の「教材表示」)。
// 記録に失敗しても閲覧自体は妨げないよう、画面側はこの結果を待たない。
export async function POST(_request: Request, { params }: { params: Promise<{ missionId: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { missionId } = await params;
  await recordContentViewed(session.userId, missionId);
  return NextResponse.json({ ok: true });
}
