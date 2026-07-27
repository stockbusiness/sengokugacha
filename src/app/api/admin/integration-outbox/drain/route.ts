import { NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { drainAllOutboxTables } from "@/lib/outbox-drain";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書§4.3.3。
// integration_outbox_events/notification_outbox_eventsに溜まった未送信・送信失敗の
// イベントを手動で再送する。送信ロジック自体は/api/internal/cron/*と共有する
// (src/lib/outbox-drain.ts、Stripe取得待ち期間対応指示書§6.1)。
// 連携基盤に影響する操作のため本部管理者(manager)のみ許可する(§9と同じ方針)。
export async function POST() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "この操作は本部管理者のみ実行できます" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();
  const { integration, notification } = await drainAllOutboxTables(supabase);

  const actorName = await getAdminActorName();
  await logAdminAction(
    actorName,
    "integration_outbox_drain",
    `integration: retried=${integration.retried} sent=${integration.sent} failed=${integration.failed} dead=${integration.dead}, ` +
      `notification: retried=${notification.retried} sent=${notification.sent} failed=${notification.failed} dead=${notification.dead}`
  );

  return NextResponse.json({ ok: true, integration, notification });
}
