import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { confirmMaturedCommissions } from "@/lib/castle-commissions";

// 8.5「報酬確定条件」。Cron基盤が無いため、本部管理者が手動で確定操作を行う。
export async function POST() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "報酬の確定は本部管理者のみ実行できます" }, { status: 403 });
  }

  const actorName = await getAdminActorName();
  const result = await confirmMaturedCommissions(actorName);

  await logAdminAction(actorName, "commission_confirm_matured", `confirmed_count=${result.confirmedCount}`);
  return NextResponse.json(result);
}
