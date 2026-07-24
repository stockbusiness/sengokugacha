import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 再解決を試みても解消しない(送信元のagent_codeが恒久的に誤っている等)場合に、
// 運用側の判断で記録を却下する。却下後に同じcommon_user_idの新しいイベントが届けば
// 新しい行として再登録される(unresolved_agent_assignments.common_user_idはunique制約)。
// モジュール化後バグ修正・Phase B改修指示書§9。代理店割当に影響する操作のため
// 本部管理者(manager)のみ許可し、単純DELETEせずresolved_at/resolved_by/
// resolution_noteを保持する(監査ログにbefore/afterを記録する)。
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "この操作は本部管理者のみ実行できます" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const resolutionNote = typeof body.resolutionNote === "string" ? body.resolutionNote : null;

  const supabase = createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("unresolved_agent_assignments")
    .select("id, common_user_id, reason, resolved_at")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.resolved_at) return NextResponse.json({ error: "既に却下済みです" }, { status: 409 });

  const actorName = await getAdminActorName();
  const resolvedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("unresolved_agent_assignments")
    .update({ resolved_at: resolvedAt, resolved_by: actorName, resolution_note: resolutionNote })
    .eq("id", id)
    .select("id, resolved_at, resolved_by, resolution_note")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await logAdminAction(actorName, "sen_no_kuni_hub_dismiss_unresolved_agent_assignment", resolutionNote ?? undefined, {
    targetType: "unresolved_agent_assignment",
    targetId: id,
    before: existing,
    after: updated,
  });

  return NextResponse.json({ ok: true });
}
