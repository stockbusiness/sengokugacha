import { NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { handleAssignedAgentUpdated } from "@/lib/agency-events";

// 千ノ国パスポート次期改修指示書 P0-2(§4.6相当)。unresolved_agent_assignmentsに
// 溜まった未解決の担当代理店割当(agentsテーブル未同期等)を、agents側の同期が進んだ
// 後に手動で再解決する。Cron等のバックグラウンドジョブ基盤が無いため管理者トリガー方式。
// handleAssignedAgentUpdated()は成功時に該当行を自己削除するため、呼び出し後に行が
// 消えていれば解決成功とみなす。
// モジュール化後バグ修正・Phase B改修指示書§9。連携基盤に影響する操作のため
// 本部管理者(manager)のみ許可する。
export async function POST() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "この操作は本部管理者のみ実行できます" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();
  const { data: rows, error } = await supabase.from("unresolved_agent_assignments").select("id, payload").limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let retriedCount = 0;
  let resolvedCount = 0;
  for (const row of rows ?? []) {
    retriedCount++;
    try {
      await handleAssignedAgentUpdated(row.payload as Record<string, unknown>);
    } catch {
      continue; // 未解決のまま残す。次回の再実行に委ねる。
    }
    const { data: stillExists } = await supabase.from("unresolved_agent_assignments").select("id").eq("id", row.id).maybeSingle();
    if (!stillExists) resolvedCount++;
  }

  const actorName = await getAdminActorName();
  await logAdminAction(actorName, "sen_no_kuni_hub_retry_agent_assignments", `retried=${retriedCount} resolved=${resolvedCount}`);

  return NextResponse.json({ ok: true, retriedCount, resolvedCount });
}
