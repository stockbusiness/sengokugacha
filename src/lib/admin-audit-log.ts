import { createSupabaseServerClient } from "@/lib/supabase-server";

// 外部購入管理機能(実装指示書v1.0 12章)向けの構造化フィールド。既存呼び出し元(30箇所以上)を
// 壊さないよう第4引数はオプショナルとし、渡さなければ従来通りdetailsの自由記述のみで記録される。
export type AdminActionTarget = {
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
};

// 監査ログの記録に失敗しても本来の管理操作自体は失敗させない(ログはあくまで補助情報のため)。
export async function logAdminAction(
  actorName: string | null,
  action: string,
  details?: string,
  target?: AdminActionTarget
) {
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("admin_audit_logs").insert({
      actor_name: actorName,
      action,
      details: details ?? null,
      target_type: target?.targetType ?? null,
      target_id: target?.targetId ?? null,
      before_snapshot: target?.before ?? null,
      after_snapshot: target?.after ?? null,
    });
    if (error) console.error("監査ログの記録に失敗しました", error);
  } catch (error) {
    console.error("監査ログの記録に失敗しました", error);
  }
}
