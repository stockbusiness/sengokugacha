import { NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { retryResolveAllUnresolvedCommonUsers } from "@/lib/common-user-resolution";

// 千ノ国パスポート Stripe取得待ち期間対応指示書 §5.7。common_user_id未解決ユーザーの
// 一括再解決。外部システム(sengoku-ai.com)への問い合わせを伴う操作のため、
// 既存のretry-agent-assignments・entitlements/retry-resolve等と同じ方針で
// 本部管理者(manager)のみ許可する。
export async function POST() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "この操作は本部管理者のみ実行できます" }, { status: 403 });
  }

  try {
    const { retriedCount, resolvedCount } = await retryResolveAllUnresolvedCommonUsers();
    const actorName = await getAdminActorName();
    await logAdminAction(actorName, "common_users_retry_resolve", `retried=${retriedCount} resolved=${resolvedCount}`);
    return NextResponse.json({ ok: true, retriedCount, resolvedCount });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "再解決に失敗しました" }, { status: 500 });
  }
}
