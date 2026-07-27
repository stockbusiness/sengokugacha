import { randomUUID } from "node:crypto";
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

// 千ノ国パスポート Stripe取得待ち期間対応指示書 §6.1。
// 管理画面の手動drain(/api/admin/integration-outbox/drain)とCron自動再送
// (/api/internal/cron/*)の両方から共有する送信ロジック。claim_token/lease方式の
// 原子的claim(20260809000008)により、2並列drainでも自動Cronでも二重送信されない。

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

async function sendIntegrationOutboxEvent(row: OutboxRow): Promise<boolean> {
  if (row.event_type === "referral.confirmed") {
    // PR #147マージ前最終修正指示§4。手動drain・Cron自動再送のいずれで再送しても、
    // 初回送信と同じidempotency keyになるようoutbox event idから生成する。
    return await confirmReferral(row.payload as unknown as ConfirmReferralInput, `outbox:integration_outbox_events:${row.id}`);
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

export type DrainResult = { retried: number; sent: number; failed: number; dead: number; skipped: number };

const EMPTY_RESULT: DrainResult = { retried: 0, sent: 0, failed: 0, dead: 0, skipped: 0 };

// maxDurationMsを超えたら残りの行はclaimせずに打ち切る(§6.1「実行時間上限」)。
// claimしていない行はstatusが変化しないため、次回の実行(手動drainまたは次のCron)で
// 安全に再試行できる。
async function drainOutboxTable(
  supabase: SupabaseServerClient,
  table: OutboxTable,
  send: (row: OutboxRow) => Promise<boolean>,
  options: { limit?: number; maxDurationMs?: number } = {}
): Promise<DrainResult> {
  const limit = options.limit ?? 200;
  const maxDurationMs = options.maxDurationMs ?? Number.POSITIVE_INFINITY;
  const startedAt = Date.now();

  const { data: rows, error } = await supabase
    .from(table)
    .select("id, source_type, source_id, event_type, target_system_key, payload, status, attempt_count, last_error, created_at, sent_at")
    .in("status", ["pending", "failed"])
    .limit(limit);
  if (error) throw error;

  const result: DrainResult = { ...EMPTY_RESULT };
  for (const row of (rows ?? []) as OutboxRow[]) {
    if (Date.now() - startedAt > maxDurationMs) break;

    const claimToken = randomUUID();
    const claimOutcome = await claimOutboxEventForDrain(supabase, table, row.id, claimToken);
    if (claimOutcome === "dead") {
      result.dead++;
      continue;
    }
    if (claimOutcome !== "claimed") {
      result.skipped++;
      continue;
    }

    result.retried++;
    try {
      const succeeded = await send(row);
      if (succeeded) {
        await markOutboxSentAfterClaim(supabase, table, row.id, claimToken);
        result.sent++;
      } else {
        await markOutboxFailedAfterClaim(supabase, table, row.id, claimToken, "送信が失敗を返しました");
        result.failed++;
      }
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "unknown error";
      await markOutboxFailedAfterClaim(supabase, table, row.id, claimToken, message);
      result.failed++;
    }
  }
  return result;
}

export async function drainIntegrationOutbox(
  supabase: SupabaseServerClient,
  options?: { limit?: number; maxDurationMs?: number }
): Promise<DrainResult> {
  return drainOutboxTable(supabase, "integration_outbox_events", sendIntegrationOutboxEvent, options);
}

export async function drainNotificationOutbox(
  supabase: SupabaseServerClient,
  options?: { limit?: number; maxDurationMs?: number }
): Promise<DrainResult> {
  return drainOutboxTable(supabase, "notification_outbox_events", sendNotificationOutboxEvent, options);
}

export async function drainAllOutboxTables(
  supabase: SupabaseServerClient,
  options?: { limit?: number; maxDurationMs?: number }
): Promise<{ integration: DrainResult; notification: DrainResult }> {
  const [integration, notification] = await Promise.all([
    drainIntegrationOutbox(supabase, options),
    drainNotificationOutbox(supabase, options),
  ]);
  return { integration, notification };
}
