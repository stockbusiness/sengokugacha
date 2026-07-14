import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { cancelExternalOrderItem, type CancelResolution } from "@/lib/external-orders";

// 一部取消(9-4、本部管理者限定)。特定の注文明細(区画1件分)のみを取消する。
export async function POST(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "一部取消の確定は本部管理者のみ実行できます" }, { status: 403 });
  }

  const { itemId } = await params;
  const body = await request.json().catch(() => null);
  const resolution: CancelResolution = body?.resolution === "refunded" ? "refunded" : "cancelled";
  const reason = typeof body?.reason === "string" ? body.reason : "";
  if (!reason.trim()) return NextResponse.json({ error: "取消理由は必須です" }, { status: 400 });

  try {
    await cancelExternalOrderItem(itemId, resolution, reason, await getAdminActorName());
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "取消処理に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
