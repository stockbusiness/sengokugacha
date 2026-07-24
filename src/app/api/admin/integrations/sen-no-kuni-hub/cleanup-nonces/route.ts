import { NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート次期改修指示書 P0-2(§6.4)。sen_no_kuni_hub_used_noncesは
// リプレイ防止のワンタイム利用記録であり、Cron等のバックグラウンドジョブ基盤が
// 本リポジトリに無いため自動削除されず無制限に増加する。管理者が手動で実行できる
// 削除アクションとして提供する(cleanup_expired_sen_no_kuni_hub_nonces()、
// マイグレーション20260807000006)。24時間より前のnonceはタイムスタンプ許容誤差
// (5分)を大きく超えており、削除してもリプレイ防止の実効性を失わない。
// モジュール化後バグ修正・Phase B改修指示書§9。連携基盤に影響する操作のため
// 本部管理者(manager)のみ許可する。
export async function POST() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "この操作は本部管理者のみ実行できます" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cleanup_expired_sen_no_kuni_hub_nonces");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const deletedCount = data as number;
  const actorName = await getAdminActorName();
  await logAdminAction(actorName, "sen_no_kuni_hub_cleanup_nonces", `deleted_count=${deletedCount}`);

  return NextResponse.json({ ok: true, deletedCount });
}
