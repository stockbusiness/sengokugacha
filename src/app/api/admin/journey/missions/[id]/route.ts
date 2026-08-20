import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminRole, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { getMissionContent } from "@/lib/learning-journey-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const STATUSES = ["draft", "published", "suspended"];

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const supabase = createSupabaseServerClient();
  const { data: mission, error } = await supabase
    .from("learning_journey_missions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!mission) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ mission, versions: await getMissionContent(id) });
}

// 完了条件・付与予定数・公開期間の設定(指示書§4.2)。
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string" && body.title.trim()) fields.title = body.title.trim();
  if (Number.isInteger(body.display_order)) fields.display_order = body.display_order;
  if ("starts_at" in body) fields.starts_at = body.starts_at || null;
  if ("ends_at" in body) fields.ends_at = body.ends_at || null;

  for (const flag of ["require_content_viewed", "require_all_questions_answered", "require_external_achievement", "allow_self_report"]) {
    if (typeof body[flag] === "boolean") fields[flag] = body[flag];
  }
  if (Number.isInteger(body.min_correct_answers) && body.min_correct_answers >= 0) {
    fields.min_correct_answers = body.min_correct_answers;
  }
  if (Number.isInteger(body.reward_amount) && body.reward_amount >= 0) fields.reward_amount = body.reward_amount;
  if ("self_report_reward_amount" in body) {
    // 空欄(null)は「通常と同額」、0は「付与対象外」。両者を区別する。
    fields.self_report_reward_amount =
      body.self_report_reward_amount === null || body.self_report_reward_amount === ""
        ? null
        : Number(body.self_report_reward_amount);
  }

  if (typeof body.status === "string" && STATUSES.includes(body.status)) {
    if (body.status === "suspended" && !(await requireManagerRole())) {
      return NextResponse.json({ error: "公開停止は本部管理者のみ実行できます" }, { status: 403 });
    }
    fields.status = body.status;
  }

  const supabase = createSupabaseServerClient();
  const { data: before } = await supabase.from("learning_journey_missions").select("*").eq("id", id).maybeSingle();
  const { data, error } = await supabase
    .from("learning_journey_missions")
    .update(fields)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAdminAction(await getAdminActorName(), "learning_journey_mission_update", `mission_id=${id}`,
    { targetType: "learning_journey_mission", targetId: id, before, after: data },
    { adminRole: await getAdminRole(), operationReason: typeof body.reason === "string" ? body.reason : null });

  return NextResponse.json(data);
}
