import { NextResponse } from "next/server";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 手動確認・対応済みとして競合記録を消す。ローカルアカウント同士の統合は行わない
// (未検証情報での自動人物統合禁止の方針は維持)。この操作自体は「運用側で確認・対応した」
// という記録用の削除であり、実際の統合作業は別途手動で行う想定。
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("common_user_merge_conflicts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await getAdminActorName();
  await logAdminAction(actorName, "sen_no_kuni_hub_resolve_merge_conflict", `id=${id}`);

  return NextResponse.json({ ok: true });
}
