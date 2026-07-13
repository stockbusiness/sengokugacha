import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { revokePlotAllocation } from "@/lib/castle-plots";

// 販売枠の回収は財務・区画在庫への影響があるため本部管理者のみ実行できる。
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "販売枠の回収は本部管理者のみ実行できます" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason : null;

  const actorName = await getAdminActorName();
  await revokePlotAllocation(id, actorName, reason);

  await logAdminAction(actorName, "plot_allocation_revoke", `allocation_id=${id}`);
  return NextResponse.json({ ok: true });
}
