import { NextResponse } from "next/server";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 再解決を試みても解消しない(送信元のagent_codeが恒久的に誤っている等)場合に、
// 運用側の判断で記録を却下する。却下後に同じcommon_user_idの新しいイベントが届けば
// 新しい行として再登録される(unresolved_agent_assignments.common_user_idはunique制約)。
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("unresolved_agent_assignments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await getAdminActorName();
  await logAdminAction(actorName, "sen_no_kuni_hub_dismiss_unresolved_agent_assignment", `id=${id}`);

  return NextResponse.json({ ok: true });
}
