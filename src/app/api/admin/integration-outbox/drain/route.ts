import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { confirmReferral, type ConfirmReferralInput } from "@/lib/common-user-hub";
import { notifyPlotPurchase } from "@/lib/castle-notifications";
import {
  claimOutboxEventForDrain,
  markOutboxFailedAfterClaim,
  markOutboxSentAfterClaim,
  type OutboxRow,
  type OutboxTable,
} from "@/lib/integration-outbox";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書§4.3.3。
// integration_outbox_events/notification_outbox_eventsに溜まった未送信・送信失敗の
// イベントを手動で再送する。Cron等のバックグラウンドジョブ基盤が無いため、既存の
// retry-agent-assignments等と同じ「管理者トリガーによる全件再試行」方式を踏襲する。
// 連携基盤に影響する操作のため本部管理者(manager)のみ許可する(§9と同じ方針)。

async function sendIntegrationOutboxEvent(row: OutboxRow): Promise<boolean> {
  if (row.event_type === "referral.confirmed") {
    return await confirmReferral(row.payload as unknown as ConfirmReferralInput);
  }
  throw new Error(`未対応のevent_typeです: ${row.event_type}`);
}

async function sendNotificationOutboxEvent(row: OutboxRow): Promise<boolean> {
  if (row.event_type === "notification.plot_purchased") {
    const payload = row.payload as { user_id: string; plot_id: string | null };
    return await notifyPlotPurchase(payload.user_id, payload.plot_id);
  }
  throw new Error(`未対応のevent_typeです: ${row.event_type}`);
}

async function drainTable(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  table: OutboxTable,
  send: (row: OutboxRow) => Promise<boolean>
): Promise<{ retried: number; sent: number }> {
  const { data: rows, error } = await supabase
    .from(table)
    .select("id, source_type, source_id, event_type, target_system_key, payload, status, attempt_count, last_error, created_at, sent_at")
    .in("status", ["pending", "failed"])
    .limit(200);
  if (error) throw error;

  let retried = 0;
  let sent = 0;
  for (const row of (rows ?? []) as OutboxRow[]) {
    // 千ノ国パスポート Phase C-0 PR4(§8.2)。送信前に原子的claimを行う。2並列drainが
    // 同じ行を取得しても、claimに成功するのは片方だけになり二重送信を防げる(20260809000008)。
    const claimToken = crypto.randomUUID();
    const claimOutcome = await claimOutboxEventForDrain(supabase, table, row.id, claimToken);
    if (claimOutcome !== "claimed") continue;

    retried++;
    try {
      const succeeded = await send(row);
      if (succeeded) {
        await markOutboxSentAfterClaim(supabase, table, row.id, claimToken);
        sent++;
      } else {
        await markOutboxFailedAfterClaim(supabase, table, row.id, claimToken, "送信が失敗を返しました");
      }
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "unknown error";
      await markOutboxFailedAfterClaim(supabase, table, row.id, claimToken, message);
    }
  }
  return { retried, sent };
}

export async function POST() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "この操作は本部管理者のみ実行できます" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();
  const [integrationResult, notificationResult] = await Promise.all([
    drainTable(supabase, "integration_outbox_events", sendIntegrationOutboxEvent),
    drainTable(supabase, "notification_outbox_events", sendNotificationOutboxEvent),
  ]);

  const actorName = await getAdminActorName();
  await logAdminAction(
    actorName,
    "integration_outbox_drain",
    `integration: retried=${integrationResult.retried} sent=${integrationResult.sent}, notification: retried=${notificationResult.retried} sent=${notificationResult.sent}`
  );

  return NextResponse.json({
    ok: true,
    integration: integrationResult,
    notification: notificationResult,
  });
}
