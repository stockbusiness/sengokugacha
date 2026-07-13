import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();
  const [{ data: contract, error }, { data: events, error: eventsError }] = await Promise.all([
    supabase
      .from("castle_lord_contracts")
      .select("*, castles:castle_id(name), desired_castle:desired_castle_id(name)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("castle_lord_contract_events")
      .select("*")
      .eq("contract_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });
  if (!contract) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ contract, events: events ?? [] });
}

// 契約の基本情報(担当者連絡先・活動計画等)のみ編集可能。状態遷移は別途PR2で
// /transition エンドポイントとして追加する(遷移マトリクスによる厳密なチェックが必要なため)。
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("agent_id" in body) fields.agent_id = body.agent_id || null;
  if ("desired_castle_id" in body) fields.desired_castle_id = body.desired_castle_id || null;
  if ("company_name" in body) fields.company_name = body.company_name || null;
  if ("contact_name" in body) fields.contact_name = body.contact_name || null;
  if ("contact_email" in body) fields.contact_email = body.contact_email || null;
  if ("contact_phone" in body) fields.contact_phone = body.contact_phone || null;
  if ("business_plan_text" in body) fields.business_plan_text = body.business_plan_text || null;
  if ("screening_notes" in body) fields.screening_notes = body.screening_notes || null;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("castle_lord_contracts")
    .update(fields)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "castle_lord_contract_update", `contract_id=${id}`);

  return NextResponse.json(data);
}
