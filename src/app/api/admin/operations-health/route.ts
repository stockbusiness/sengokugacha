import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCommissionWriteBlockedStats } from "@/lib/commission-write-monitoring";
import { getMigrationStatus } from "@/lib/migration-status";
import { runReconciliationChecks } from "@/modules/operations/reconciliation";

// 千ノ国パスポート Stripe取得待ち期間対応指示書 §6.2。読み取り専用の照合結果表示のため
// operator/manager両方許可する(§10と同じ方針、管理画面表示APIはoperatorも閲覧可能)。
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseServerClient();
    // マイグレーションの適用漏れ検知は照合とは独立しているので、
    // 片方が失敗してももう片方は返せるようにする。
    const [findings, migrations, commissionWriteBlocked] = await Promise.all([
      runReconciliationChecks(supabase),
      getMigrationStatus().catch((error) => ({
        available: false as const,
        reason: error instanceof Error ? error.message : "確認できませんでした",
      })),
      // PR-P1b。停止中に報酬計上が呼ばれた件数。取得に失敗しても他の結果は返す。
      getCommissionWriteBlockedStats().catch(() => null),
    ]);
    return NextResponse.json({
      findings,
      migrations,
      commissionWriteBlocked,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "照合に失敗しました" }, { status: 500 });
  }
}
