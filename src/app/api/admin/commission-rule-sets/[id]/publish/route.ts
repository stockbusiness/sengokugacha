import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { validateRuleSetRates } from "@/lib/castle-commission-engine";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 14.4「公開後のルールは編集せず、新バージョンを作成する」。公開は本部管理者のみ。
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "報酬ルールの公開は本部管理者のみ実行できます" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();

  const { data: ruleSet, error: fetchError } = await supabase
    .from("commission_rule_sets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!ruleSet) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!validateRuleSetRates(ruleSet)) {
    return NextResponse.json({ error: "料率の合計が100%になっていません" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("commission_rule_sets")
    .update({ status: "published", effective_from: nowIso, published_at: nowIso, updated_at: nowIso })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "commission_rule_set_publish", `rule_set_id=${id}`);
  return NextResponse.json(data);
}
