import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { drainIntegrationOutbox } from "@/lib/outbox-drain";
import { logAdminAction } from "@/lib/admin-audit-log";

// 千ノ国パスポート Stripe取得待ち期間対応指示書 §6.1。
// integration_outbox_eventsの定期自動再送。Vercel Cronは設定したpathへGETで
// リクエストする(https://vercel.com/docs/cron-jobsのドキュメント通り)。手動トリガー・
// 他のスケジューラからも呼べるようPOSTでも同じ処理を受け付ける。
//
// 認証: Vercel Cronは環境変数CRON_SECRETが設定されている場合、
// `Authorization: Bearer <CRON_SECRET>`ヘッダーを自動付与する。CRON_SECRET未設定の
// 環境ではこのエンドポイントは常に401を返す(安全側のデフォルト)。
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

// Vercel Hobby/Proのサーバーレス関数実行時間上限に対する安全マージン。上限に達したら
// 残りの行はclaimせず打ち切り、次回の実行(10分間隔想定)に委ねる。
const MAX_DURATION_MS = 8000;
const BATCH_LIMIT = 100;

async function handle(): Promise<NextResponse> {
  const supabase = createSupabaseServerClient();
  const startedAt = Date.now();
  const result = await drainIntegrationOutbox(supabase, { limit: BATCH_LIMIT, maxDurationMs: MAX_DURATION_MS });

  await logAdminAction(
    null,
    "cron_integration_outbox_drain",
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
