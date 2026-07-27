import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { drainNotificationOutbox } from "@/lib/outbox-drain";
import { logAdminAction } from "@/lib/admin-audit-log";

// 千ノ国パスポート Stripe取得待ち期間対応指示書 §6.1。
// notification_outbox_eventsの定期自動再送。認証・実行時間上限の方針は
// integration-outbox/route.tsと同じ(コメント参照)。

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

const MAX_DURATION_MS = 8000;
const BATCH_LIMIT = 100;

async function handle(): Promise<NextResponse> {
  const supabase = createSupabaseServerClient();
  const startedAt = Date.now();
  const result = await drainNotificationOutbox(supabase, { limit: BATCH_LIMIT, maxDurationMs: MAX_DURATION_MS });

  await logAdminAction(
    null,
    "cron_notification_outbox_drain",
    `retried=${result.retried} sent=${result.sent} failed=${result.failed} dead=${result.dead} skipped=${result.skipped}`
  );

  return NextResponse.json({ ok: true, ...result, durationMs: Date.now() - startedAt });
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return handle();
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return handle();
}
