import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const EDITABLE_STATUSES = [
  "draft",
  "available",
  "reserved",
  "application_pending",
  "payment_pending",
  "sold",
  "cancelled",
  "suspended",
];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") fields.name = body.name.trim();
  if ("block_label" in body) fields.block_label = body.block_label || null;
  if ("description" in body) fields.description = body.description || null;
  if ("main_image_url" in body) fields.main_image_url = body.main_image_url || null;
  if (Number.isFinite(body.price_yen)) fields.price_yen = body.price_yen;
  if (Number.isFinite(body.display_order)) fields.display_order = body.display_order;
  if (typeof body.status === "string" && EDITABLE_STATUSES.includes(body.status)) {
    fields.status = body.status;
    if (body.status === "sold") {
      // 外部ショップシステムで成約した区画を本部が手動で「販売済み」にする経路。
      // Stripe決済を経由しないため、購入者アカウントとの紐付け(owner_user_id)は行わない。
      fields.sold_at = new Date().toISOString();
      fields.sold_price_yen = Number.isFinite(body.sold_price_yen) ? body.sold_price_yen : null;
    } else {
      fields.sold_at = null;
      fields.sold_price_yen = null;
      fields.owner_user_id = null;
    }
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("castle_plots").update(fields).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actionDetail =
    typeof body.status === "string" && body.status === "sold"
      ? `plot_id=${id} status=sold sold_price_yen=${fields.sold_price_yen ?? "未入力"}`
      : `plot_id=${id}`;
  await logAdminAction(await getAdminActorName(), "castle_plot_update", actionDetail);

  return NextResponse.json(data);
}
