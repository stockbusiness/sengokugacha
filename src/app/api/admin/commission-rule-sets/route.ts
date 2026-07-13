import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { validateRuleSetRates } from "@/lib/castle-commission-engine";
import { getRuleSets } from "@/lib/commission-rule-sets";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ruleSets = await getRuleSets();
  return NextResponse.json(ruleSets);
}

// 下書き作成はoperatorでも可(公開のみmanager限定、/[id]/publishで別途チェックする)。
export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

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

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("commission_rule_sets")
    .insert({
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "新規ルールセット",
      ...rateSet,
      created_by: await getAdminActorName(),
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "commission_rule_set_create", `rule_set_id=${data.id}`);
  return NextResponse.json(data);
}
