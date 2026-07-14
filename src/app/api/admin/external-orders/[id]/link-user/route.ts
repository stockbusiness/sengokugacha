import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { getExternalOrderDetail, linkUserToOrder } from "@/lib/external-orders";
import { InvalidExternalOrderTransitionError } from "@/lib/external-order-state";

// 購入者↔LINEユーザーの紐付け確定(6章、本部管理者限定)。
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "ユーザー紐付け確定は本部管理者のみ実行できます" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const userId = typeof body?.user_id === "string" ? body.user_id : null;
  if (!userId) return NextResponse.json({ error: "user_id は必須です" }, { status: 400 });

  try {
    await linkUserToOrder(id, userId, await getAdminActorName());
    const detail = await getExternalOrderDetail(id);
    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof InvalidExternalOrderTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "紐付けの確定に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
