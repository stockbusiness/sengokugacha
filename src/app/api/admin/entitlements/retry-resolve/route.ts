import { NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { retryResolveEntitlementGrant } from "@/lib/entitlements";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書§5.5後半。
// common_user_id未解決のため保留されているentitlementを、common_user_idの同期が
// 進んだ後に手動で一括再解決する。Cron等のバックグラウンドジョブ基盤が無いため、
// 既存のretry-agent-assignments等と同じ「管理者トリガーによる全件再試行」方式を踏襲する。
// 残高付与に影響する操作のため本部管理者(manager)のみ許可する(§9と同じ方針)。
export async function POST() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "この操作は本部管理者のみ実行できます" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("entitlements")
    .select("id")
    .eq("application_status", "not_applied")
    .is("user_id", null)
    .is("resolution_dismissed_at", null)
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let retriedCount = 0;
  let resolvedCount = 0;
  let notAppliedCount = 0;
  const notAppliedReasons: Record<string, number> = {};

  for (const row of rows ?? []) {
    retriedCount++;
    try {
      const result = await retryResolveEntitlementGrant(row.id as string);
      // claimed_then_reversed: 解決した時点で既にrevoke済みだったため、grant適用直後に
      // 自動で取消まで完結したケース(マージ前最終修正指示§1)。処理は完了している。
      const completed = result.claim_outcome === "claimed" || result.claim_outcome === "claimed_then_reversed";
      if (!completed) continue;

      // PR-P2b。処理が完了しても残高へ入ったとは限らない(送信元が未許可、商品コードが
      // 未指定・担当外、種別が対象外など)。これを「解決済み」に数えると、残高が入って
      // いないものを成功付与として報告してしまう。
      const { data: after } = await supabase
        .from("entitlements")
        .select("application_decision")
        .eq("id", row.id as string)
        .single();

      const decision = (after?.application_decision as string | null) ?? null;
      if (decision === null || decision === "APPLIED") {
        resolvedCount++;
      } else {
        notAppliedCount++;
        notAppliedReasons[decision] = (notAppliedReasons[decision] ?? 0) + 1;
      }
    } catch {
      continue; // 未解決のまま残す。次回の再実行に委ねる。
    }
  }

  const actorName = await getAdminActorName();
  await logAdminAction(
    actorName,
    "entitlements_retry_resolve",
    `retried=${retriedCount} resolved=${resolvedCount} not_applied=${notAppliedCount}`
  );

  return NextResponse.json({ ok: true, retriedCount, resolvedCount, notAppliedCount, notAppliedReasons });
}
