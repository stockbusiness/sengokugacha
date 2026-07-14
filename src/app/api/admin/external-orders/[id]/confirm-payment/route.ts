import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { confirmPayment, getExternalOrderDetail } from "@/lib/external-orders";
import { InvalidExternalOrderTransitionError } from "@/lib/external-order-state";

// 入金確認確定(実装計画8章、本部管理者限定)。
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "入金確認確定は本部管理者のみ実行できます" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await confirmPayment(id, await getAdminActorName());
    const detail = await getExternalOrderDetail(id);
    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof InvalidExternalOrderTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "入金確認の確定に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
