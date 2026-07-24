import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書§5.5後半。
// entitlement.granted受信時、common_user_idに対応するローカルユーザーがまだ同期されて
// おらず(process_entitlement_grant()がclaim_outcome='user_unresolved'を返し)、
// application_statusがnot_appliedのまま保留されているentitlementの一覧を返す
// (管理画面表示用)。却下済み(resolution_dismissed_at設定済み)は一覧から除く。
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("entitlements")
    .select("id, entitlement_id, common_user_id, source_system_key, entitlement_type, application_attempt_count, granted_at")
    .eq("application_status", "not_applied")
    .is("user_id", null)
    .is("resolution_dismissed_at", null)
    .order("granted_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
