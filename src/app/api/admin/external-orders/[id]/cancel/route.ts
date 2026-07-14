import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { cancelExternalOrder, getExternalOrderDetail, type CancelResolution } from "@/lib/external-orders";
import { InvalidExternalOrderTransitionError } from "@/lib/external-order-state";

// 取消・返金確定(9章、本部管理者限定)。外部ショップ側の返金処理は行わず、
// 戦国パスポート側の状態(注文・区画割当・区画権利)のみ反映する。
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "取消・返金の確定は本部管理者のみ実行できます" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const resolution: CancelResolution = body?.resolution === "refunded" ? "refunded" : "cancelled";
  const reason = typeof body?.reason === "string" ? body.reason : "";
  if (!reason.trim()) return NextResponse.json({ error: "取消理由は必須です" }, { status: 400 });

  try {
    await cancelExternalOrder(id, resolution, reason, await getAdminActorName());
    const detail = await getExternalOrderDetail(id);
    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof InvalidExternalOrderTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "取消処理に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
