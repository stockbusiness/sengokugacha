import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 再解決を試みても解消しない(送信元のcommon_user_idが恒久的に誤っている等)場合に、
// 運用側の判断で一覧から却下する。entitlement自体は削除せず、application_statusも
// not_appliedのまま維持する(台帳としての記録・将来の手動対応の余地を残す)。
// モジュール化後バグ修正・Phase B改修指示書§5.5後半・§9と同じ方針。残高付与に
// 影響する連携基盤の操作のため本部管理者(manager)のみ許可し、単純DELETEせず
// resolution_dismissed_at/resolution_dismissed_by/resolution_dismissal_noteを
// 保持する(監査ログにbefore/afterを記録する)。
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "この操作は本部管理者のみ実行できます" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const dismissalNote = typeof body.resolutionNote === "string" ? body.resolutionNote : null;

  const supabase = createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("entitlements")
    .select("id, entitlement_id, common_user_id, source_system_key, entitlement_type, resolution_dismissed_at")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.resolution_dismissed_at) return NextResponse.json({ error: "既に却下済みです" }, { status: 409 });

  const actorName = await getAdminActorName();
  const dismissedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("entitlements")
    .update({ resolution_dismissed_at: dismissedAt, resolution_dismissed_by: actorName, resolution_dismissal_note: dismissalNote })
    .eq("id", id)
    .select("id, resolution_dismissed_at, resolution_dismissed_by, resolution_dismissal_note")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await logAdminAction(actorName, "entitlements_dismiss_unresolved", dismissalNote ?? undefined, {
    targetType: "entitlement",
    targetId: id,
    before: existing,
    after: updated,
  });

  return NextResponse.json({ ok: true });
}
