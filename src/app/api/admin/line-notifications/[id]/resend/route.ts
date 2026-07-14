import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { resendLineNotification } from "@/lib/external-order-notifications";

// LINE通知の再送(10-2)。
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await resendLineNotification(id);
    await logAdminAction(await getAdminActorName(), "line_notification_resend", `log_id=${id}`, {
      targetType: "line_notification_log",
      targetId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "再送に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
