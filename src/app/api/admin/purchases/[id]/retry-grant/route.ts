import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { runPurchaseGrant } from "@/lib/purchase-grants";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート 全体統合対応 実装計画(PR3)。決済は完了しているが権利付与に
// 失敗した購入(status='processing' かつ grant_status='failed')を、管理画面から
// 手動で再実行する。財務影響のある操作のため本部管理者のみ許可する。
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "権利付与の再実行は本部管理者のみ実行できます" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();
  const { data: purchase, error: fetchError } = await supabase
    .from("purchases")
    .select("id, status, grant_status")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!purchase) return NextResponse.json({ error: "purchase not found" }, { status: 404 });
  if (purchase.status !== "processing" || purchase.grant_status !== "failed") {
    return NextResponse.json({ error: "権利付与が失敗している購入のみ再実行できます" }, { status: 400 });
  }

  try {
    await runPurchaseGrant(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "再実行に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const actorName = await getAdminActorName();
  await logAdminAction(actorName, "purchase_grant_retry", `purchase_id=${id}`);

  return NextResponse.json({ ok: true });
}
