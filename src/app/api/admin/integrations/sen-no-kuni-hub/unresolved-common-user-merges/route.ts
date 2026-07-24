import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書§10.2。
// unresolved_common_user_mergesの一覧取得(未解決分のみ)。
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("unresolved_common_user_merges")
    .select("id, source_common_user_id, target_common_user_id, reason, attempt_count, created_at, updated_at")
    .eq("status", "pending")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
