import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { retryResolveCommonUser } from "@/lib/common-user-resolution";

// 千ノ国パスポート Stripe取得待ち期間対応指示書 §5.7。common_user_id未解決ユーザーの
// 個別再解決。一括再解決(retry-resolve/route.ts)と同じ原子的claim(20260811000001)を
// 使うため、同一ユーザーに対して両者が同時に実行されても二重にresolveCommonUserId()を
// 呼ばない。
export async function POST(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "この操作は本部管理者のみ実行できます" }, { status: 403 });
  }

  const { userId } = await params;

  try {
    const outcome = await retryResolveCommonUser(userId);
    const actorName = await getAdminActorName();
    await logAdminAction(actorName, "common_user_retry_resolve", `outcome=${outcome}`, {
      targetType: "user",
      targetId: userId,
    });
    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "再解決に失敗しました" }, { status: 500 });
  }
}
