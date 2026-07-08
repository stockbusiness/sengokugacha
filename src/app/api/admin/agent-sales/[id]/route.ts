import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const payoutStatus = body?.payout_status;

  if (payoutStatus !== "paid" && payoutStatus !== "unpaid") {
    return NextResponse.json({ error: "invalid payout_status" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_sales")
    .update({ payout_status: payoutStatus, paid_at: payoutStatus === "paid" ? new Date().toISOString() : null })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "agent_sale_payout_status_change", `id=${id} status=${payoutStatus}`);

  return NextResponse.json(data);
}
