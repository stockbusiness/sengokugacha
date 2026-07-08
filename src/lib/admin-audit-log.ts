import { createSupabaseServerClient } from "@/lib/supabase-server";

// 監査ログの記録に失敗しても本来の管理操作自体は失敗させない(ログはあくまで補助情報のため)。
export async function logAdminAction(actorName: string | null, action: string, details?: string) {
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("admin_audit_logs").insert({
      actor_name: actorName,
      action,
      details: details ?? null,
    });
    if (error) console.error("監査ログの記録に失敗しました", error);
  } catch (error) {
    console.error("監査ログの記録に失敗しました", error);
  }
}
