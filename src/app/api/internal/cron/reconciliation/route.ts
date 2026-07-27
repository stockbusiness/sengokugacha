import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { runReconciliationChecks, type ReconciliationFinding } from "@/modules/operations/reconciliation";
import { logAdminAction } from "@/lib/admin-audit-log";

// 千ノ国パスポート Stripe取得待ち期間対応指示書 §6.2・§6.3。
// reconciliation_snapshot()を定期実行し、異常が見つかった項目をSentryへ通知する
// (§6.3「最低限通知する」項目のうち、残高不整合・entitlement不整合・
// common_user_id未解決増加・outbox/inbox failed/deadに対応)。
// 自動修正は一切行わない(検出・記録・通知のみ、§6.2方針)。
//
// 認証方針はintegration-outbox/notification-outboxと同じ(CRON_SECRET必須)。
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

async function handle(): Promise<NextResponse> {
  const supabase = createSupabaseServerClient();
  const findings = await runReconciliationChecks(supabase);
  const anomalies = findings.filter((f) => f.count > 0);

  for (const finding of anomalies) {
    // captureMessageはSENTRY_DSN未設定時は何もしない(Sentry SDKの既定動作)。
    Sentry.captureMessage(`[reconciliation] ${finding.category}.${finding.checkName}: ${finding.count}件`, {
      level: "warning",
      tags: { category: finding.category, check: finding.checkName },
      extra: { detail: finding.detail, count: finding.count },
    });
  }

  await logAdminAction(
    null,
    "cron_reconciliation",
    anomalies.length === 0
      ? "異常なし"
      : anomalies.map((a: ReconciliationFinding) => `${a.category}.${a.checkName}=${a.count}`).join(", ")
  );

  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), anomalyCount: anomalies.length, anomalies });
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
