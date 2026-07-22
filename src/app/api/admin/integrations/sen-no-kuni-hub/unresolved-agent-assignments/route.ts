import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート 統合管理画面(PASSPORT_GACHA_PACKAGE 03指示書、必須改修③)。
// unresolved_agent_assignments(PR-F、§4.6相当)の一覧取得。
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("unresolved_agent_assignments")
    .select("id, common_user_id, reason, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
