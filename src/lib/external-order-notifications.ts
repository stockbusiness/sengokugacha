import { getLineSettings } from "@/lib/line-settings";
import { pushMessage } from "@/lib/line-push";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 実装指示書v1.0 10章。既存のcastle-notifications.tsは送達記録を持たない
// 単純なベストエフォート送信だが、外部購入管理は「送信成功・失敗を記録」
// 「失敗理由を保存」「管理画面から再送可能」「同一通知の重複送信を防止」が
// 明示要件のため、line_notification_logsテーブルに記録する専用の実装にしている。

export const EXTERNAL_ORDER_NOTIFICATION_TYPES = [
  "user_link_requested",
  "plot_assigned",
  "rights_granted",
  "plot_changed",
  "rights_revoked",
  "refund_applied",
] as const;

export type ExternalOrderNotificationType = (typeof EXTERNAL_ORDER_NOTIFICATION_TYPES)[number];

const MESSAGE_BY_TYPE: Record<ExternalOrderNotificationType, string> = {
  user_link_requested: "【戦国パスポート】ご購入いただいた区画とアカウントの紐付けが完了しました。",
  plot_assigned: "【戦国パスポート】ご購入区画の割当が完了しました。権利付与までもう少しお待ちください。",
  rights_granted: "【戦国パスポート】区画の権利付与が完了しました。所有区画ページからご確認いただけます。",
  plot_changed: "【戦国パスポート】ご購入区画の内容が変更されました。詳細は所有区画ページをご確認ください。",
  rights_revoked: "【戦国パスポート】お手続きの取消に伴い、区画の権利を取り消しました。",
  refund_applied: "【戦国パスポート】返金の確認が取れましたので、ご購入内容を取り消しました。",
};

async function sendAndRecord(logId: string, lineUserId: string, type: ExternalOrderNotificationType) {
  const supabase = createSupabaseServerClient();
  try {
    const settings = await getLineSettings();
    if (!settings?.messaging_channel_access_token) {
      throw new Error("LINEチャネルアクセストークンが未設定です");
    }
    await pushMessage(settings.messaging_channel_access_token, lineUserId, MESSAGE_BY_TYPE[type]);
    const { error } = await supabase
      .from("line_notification_logs")
      .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
      .eq("id", logId);
    // 「成功済み」の部分ユニークインデックス違反=別プロセスが同時に送信成功させた(10-2の重複防止)。
    // その場合はこの行を失敗のまま残してよい(実質的に通知は届いているため)。
    if (error) console.error("送達記録の更新に失敗しました", error);
  } catch (error) {
    const message = error instanceof Error ? error.message : "送信に失敗しました";
    await supabase.from("line_notification_logs").update({ status: "failed", error_message: message }).eq("id", logId);
  }
}

// 外部注文イベントに応じたLINE個別通知。送達記録をline_notification_logsへ残し、
// 送信失敗時も本来の処理(権利付与・取消等)は失敗させない(ベストエフォート)。
export async function notifyExternalOrderEvent(
  orderId: string,
  lineUserId: string | null,
  type: ExternalOrderNotificationType
): Promise<void> {
  if (!lineUserId) return;
  const supabase = createSupabaseServerClient();

  const { data: alreadySent } = await supabase
    .from("line_notification_logs")
    .select("id")
    .eq("target_type", "external_order")
    .eq("target_id", orderId)
    .eq("notification_type", type)
    .eq("status", "sent")
    .maybeSingle();
  if (alreadySent) return; // 同一通知の重複送信防止(10-2)。

  const { data: log, error: insertError } = await supabase
    .from("line_notification_logs")
    .insert({ notification_type: type, target_type: "external_order", target_id: orderId, line_user_id: lineUserId, status: "pending" })
    .select("id")
    .single();
  if (insertError) {
    console.error("LINE通知ログの作成に失敗しました", insertError);
    return;
  }

  await sendAndRecord(log.id as string, lineUserId, type);
}

// 失敗した通知の再送(10-2)。
export async function resendLineNotification(logId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data: log, error } = await supabase.from("line_notification_logs").select("*").eq("id", logId).maybeSingle();
  if (error) throw error;
  if (!log) throw new Error("通知ログが見つかりません");
  if (log.status === "sent") throw new Error("この通知はすでに送信済みです");

  await sendAndRecord(logId, log.line_user_id as string, log.notification_type as ExternalOrderNotificationType);
}
