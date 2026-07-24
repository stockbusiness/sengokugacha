import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { listPendingOrFailedOutboxEvents } from "@/lib/integration-outbox";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書§4.3.3。
// integration_outbox_events(外部システム宛)・notification_outbox_events(LINE通知)の
// 未送信・送信失敗の一覧を返す(管理画面表示用)。
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const [integrationEvents, notificationEvents] = await Promise.all([
    listPendingOrFailedOutboxEvents(supabase, "integration_outbox_events"),
    listPendingOrFailedOutboxEvents(supabase, "notification_outbox_events"),
  ]);

  return NextResponse.json({
    integrationEvents: integrationEvents.map((e) => ({ ...e, table: "integration_outbox_events" as const })),
    notificationEvents: notificationEvents.map((e) => ({ ...e, table: "notification_outbox_events" as const })),
  });
}
