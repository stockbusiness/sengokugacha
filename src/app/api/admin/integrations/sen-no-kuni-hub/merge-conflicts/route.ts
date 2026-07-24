import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート 統合管理画面(PASSPORT_GACHA_PACKAGE 03指示書、必須改修③)。
// common_user_merge_conflicts(PR-F、§4.6相当)の一覧取得。未検証情報での自動人物統合は
// 禁止する方針のため、ここでは閲覧のみを提供し、実際の統合はこの画面からは行わない。
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("common_user_merge_conflicts")
    .select("id, source_common_user_id, target_common_user_id, source_user_id, conflicting_target_user_id, created_at")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
