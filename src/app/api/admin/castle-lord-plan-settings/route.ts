import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("castle_lord_plan_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// プラン価格・料率に直結する設定のため、本部管理者のみ変更可能とする。
export async function PUT(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "本部管理者のみ変更できます" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data: existing, error: fetchError } = await supabase
    .from("castle_lord_plan_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const fields: Record<string, unknown> = {
    plan_price_yen: body.plan_price_yen,
    min_agent_rank_for_lord: body.min_agent_rank_for_lord,
    min_agent_rank_for_commission: body.min_agent_rank_for_commission,
    retroactive_payout_enabled: !!body.retroactive_payout_enabled,
    contract_term_months: body.contract_term_months,
    initial_plot_capacity: body.initial_plot_capacity,
    stage2_plot_capacity: body.stage2_plot_capacity,
    stage3_plot_capacity: body.stage3_plot_capacity,
    land_plot_standard_price_yen: body.land_plot_standard_price_yen,
    reservation_expiry_minutes: body.reservation_expiry_minutes,
    commission_confirmation_grace_days: body.commission_confirmation_grace_days,
    updated_at: new Date().toISOString(),
  };

  const query = existing
    ? supabase.from("castle_lord_plan_settings").update(fields).eq("id", existing.id)
    : supabase.from("castle_lord_plan_settings").insert(fields);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "castle_lord_plan_settings_update");

  return NextResponse.json({ ok: true });
}
