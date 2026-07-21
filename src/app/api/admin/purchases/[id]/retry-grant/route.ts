import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { logAdminAction } from "@/lib/admin-audit-log";
import { runPurchaseGrant } from "@/lib/purchase-grants";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート 全体統合対応 実装計画(PR3)。P0-2(§4.2・6.3)で排他制御を追加。
// 決済は完了しているが権利付与に失敗した購入(status='processing' かつ
// grant_status='failed')を、管理画面から手動で再実行する。財務影響のある操作のため
// 本部管理者のみ許可する。
// 従来はSELECTで状態確認後にrunPurchaseGrant()を呼ぶ非原子的な流れだったため、
// 管理者が連打した場合や複数タブから同時に再実行した場合に、両方のリクエストが
// チェックを通過して同時にrunPurchaseGrant()を呼べてしまう競合状態があった(P0-2で
// 指摘されたバグ#2)。'failed'→'retrying'への更新をWHERE句付きの単一UPDATEで行い、
// 実際に更新できた1リクエストだけが再実行処理へ進むようにする(guard-clause update)。
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "権利付与の再実行は本部管理者のみ実行できます" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();

  const { data: purchase, error: fetchError } = await supabase.from("purchases").select("id").eq("id", id).maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!purchase) return NextResponse.json({ error: "purchase not found" }, { status: 404 });

  const { data: claimed, error: claimError } = await supabase
    .from("purchases")
    .update({ grant_status: "retrying" })
    .eq("id", id)
    .eq("status", "processing")
    .eq("grant_status", "failed")
    .select("id")
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimed) {
    return NextResponse.json(
      { error: "権利付与が失敗している購入のみ再実行できます(既に処理中の可能性があります)", code: "grant_already_processing" },
      { status: 409 }
    );
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
