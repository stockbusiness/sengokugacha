import { NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { handleCommonUserMerged } from "@/lib/agency-events";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書§10.2。
// unresolved_common_user_mergesに溜まった、統合元(source)ユーザーが未同期だった
// ためのcommon_user.mergedイベントを、ユーザー登録・common_user_id同期が進んだ後に
// 手動で再解決する。handleCommonUserMerged()は成功時に該当行をstatus='resolved'へ
// 更新するため、呼び出し後の状態を見て解決成功とみなす。
// 連携基盤に影響する操作のため本部管理者(manager)のみ許可する(§9と同じ方針)。
export async function POST() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "この操作は本部管理者のみ実行できます" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("unresolved_common_user_merges")
    .select("id, attempt_count, payload")
    .eq("status", "pending")
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let retriedCount = 0;
  let resolvedCount = 0;
  for (const row of rows ?? []) {
    retriedCount++;
    try {
      await handleCommonUserMerged(row.payload as Record<string, unknown>);
    } catch (retryError) {
      const message = retryError instanceof Error ? retryError.message : "unknown error";
      await supabase
        .from("unresolved_common_user_merges")
        .update({ attempt_count: (row.attempt_count as number) + 1, last_error: message, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      continue;
    }
    const { data: current } = await supabase
      .from("unresolved_common_user_merges")
      .select("status")
      .eq("id", row.id)
      .maybeSingle();
    if (current?.status === "resolved") resolvedCount++;
  }

  const actorName = await getAdminActorName();
  await logAdminAction(actorName, "sen_no_kuni_hub_retry_common_user_merges", `retried=${retriedCount} resolved=${resolvedCount}`);

  return NextResponse.json({ ok: true, retriedCount, resolvedCount });
}
