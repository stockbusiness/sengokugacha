import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 手動確認・対応済みとして競合記録をresolved化する。ローカルアカウント同士の統合は
// 行わない(未検証情報での自動人物統合禁止の方針は維持)。この操作自体は「運用側で
// 確認・対応した」という記録であり、実際の統合作業は別途手動で行う想定。
// モジュール化後バグ修正・Phase B改修指示書§9。common_user統合競合の解決は
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
    .from("common_user_merge_conflicts")
    .select("id, source_common_user_id, target_common_user_id, source_user_id, conflicting_target_user_id, resolved_at")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.resolved_at) return NextResponse.json({ error: "既に解決済みです" }, { status: 409 });

  const actorName = await getAdminActorName();
  const resolvedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("common_user_merge_conflicts")
    .update({ resolved_at: resolvedAt, resolved_by: actorName, resolution_note: resolutionNote })
    .eq("id", id)
    .select("id, resolved_at, resolved_by, resolution_note")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await logAdminAction(actorName, "sen_no_kuni_hub_resolve_merge_conflict", resolutionNote ?? undefined, {
    targetType: "common_user_merge_conflict",
    targetId: id,
    before: existing,
    after: updated,
  });

  return NextResponse.json({ ok: true });
}
