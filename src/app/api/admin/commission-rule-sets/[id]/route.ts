import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { validateRuleSetRates } from "@/lib/castle-commission-engine";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 14.4「公開後のルールは編集せず、新バージョンを作成する」。下書き(draft)のみ編集可能
// (operatorでも可。公開自体は別途/publishでmanager限定)。
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data: existing, error: fetchError } = await supabase
    .from("commission_rule_sets")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.status !== "draft") {
    return NextResponse.json({ error: "公開済みのルールセットは編集できません(新しいルールセットを作成してください)" }, { status: 400 });
  }

  const rateSet = {
    lord_rate: Number(body.lord_rate),
    agency_rate: Number(body.agency_rate),
    organization_rate: Number(body.organization_rate),
    regional_activity_rate: Number(body.regional_activity_rate),
    development_fund_rate: Number(body.development_fund_rate),
    hq_rate: Number(body.hq_rate),
  };
  if (!validateRuleSetRates(rateSet)) {
    return NextResponse.json({ error: "料率の合計が100%になっていません" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("commission_rule_sets")
    .update({
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "新規ルールセット",
      ...rateSet,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "commission_rule_set_update", `rule_set_id=${id}`);
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();
  const { data: existing, error: fetchError } = await supabase
    .from("commission_rule_sets")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.status !== "draft") {
    return NextResponse.json({ error: "公開済みのルールセットは削除できません" }, { status: 400 });
  }

  const { error } = await supabase.from("commission_rule_sets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "commission_rule_set_delete", `rule_set_id=${id}`);
  return NextResponse.json({ ok: true });
}
