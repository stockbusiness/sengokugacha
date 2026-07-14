import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { ExternalOrderPermissionError, getExternalOrderDetail, submitExternalOrder } from "@/lib/external-orders";
import { InvalidExternalOrderTransitionError } from "@/lib/external-order-state";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const detail = await getExternalOrderDetail(id);
    if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : "取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 注文情報の基本項目の編集、およびdraft→payment_pendingの提出(5-1・5-2)。
// 入金確認以降の状態遷移は専用エンドポイント(confirm-payment/link-user/grant-rights等)で行う。
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const actorName = await getAdminActorName();

  try {
    if (body.action === "submit") {
      await submitExternalOrder(id, actorName);
      const detail = await getExternalOrderDetail(id);
      return NextResponse.json(detail);
    }

    const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("buyer_name" in body) fields.buyer_name = body.buyer_name;
    if ("buyer_name_kana" in body) fields.buyer_name_kana = body.buyer_name_kana || null;
    if ("buyer_email" in body) fields.buyer_email = body.buyer_email || null;
    if ("buyer_phone" in body) fields.buyer_phone = body.buyer_phone || null;
    if ("castle_id" in body) fields.castle_id = body.castle_id || null;
    if ("admin_memo" in body) fields.admin_memo = body.admin_memo || null;
    if ("purchased_at" in body) fields.purchased_at = body.purchased_at || null;

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from("external_orders").update(fields).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logAdminAction(actorName, "external_order_update", `order_id=${id}`, {
      targetType: "external_order",
      targetId: id,
    });

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof InvalidExternalOrderTransitionError || error instanceof ExternalOrderPermissionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "更新に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
