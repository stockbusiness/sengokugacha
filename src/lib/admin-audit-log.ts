import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { AdminRole } from "@/lib/admin-session";

// 外部購入管理機能(実装指示書v1.0 12章)向けの構造化フィールド。既存呼び出し元(30箇所以上)を
// 壊さないよう第4引数はオプショナルとし、渡さなければ従来通りdetailsの自由記述のみで記録される。
export type AdminActionTarget = {
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
};

// 「はじまりの旅」実装指示書§7末尾・§11(ADR-10)。監査ログに残すべき6項目のうち、
// 対象種別・対象ID・変更前後の値は AdminActionTarget で表現できていたが、
// 管理者ロール・リクエストID・操作理由の3つが記録できていなかった。
//
// 新規の監査テーブルは作らず admin_audit_logs にNULL許容列を足して受ける。
// この第5引数もオプショナルなので、既存の呼び出し106箇所は無変更で動く。
export type AdminActionContext = {
  // 操作時の管理者ロール。共有パスワード方式のため、実行者名と同じく自己申告の域を出ない
  // 点に注意(指示書§11「共有認証・自己申告であることが分かる属性を残す」)。
  adminRole?: AdminRole | null;
  // 1回のリクエストで発生した複数の記録を突き合わせるためのID。
  requestId?: string | null;
  // 重要操作(付与上限変更・LIMIT_HELD解除・取消訂正・緊急停止)では必須とする。
  // 必須化の判定は呼び出し側(APIルート)の責務。
  operationReason?: string | null;
};

// 監査ログの記録に失敗しても本来の管理操作自体は失敗させない(ログはあくまで補助情報のため)。
export async function logAdminAction(
  actorName: string | null,
  action: string,
  details?: string,
  target?: AdminActionTarget,
  context?: AdminActionContext
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
      admin_role: context?.adminRole ?? null,
      request_id: context?.requestId ?? null,
      operation_reason: context?.operationReason ?? null,
    });
    if (error) console.error("監査ログの記録に失敗しました", error);
  } catch (error) {
    console.error("監査ログの記録に失敗しました", error);
  }
}
