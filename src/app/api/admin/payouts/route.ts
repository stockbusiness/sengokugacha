import { NextRequest, NextResponse } from "next/server";
import { logAdminActionWithResult } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type PayoutRpcRow = {
  outcome: "created" | "no_target" | "invalid_recipient";
  payout_id: string;
  line_count: number;
  total_amount_yen: number | string;
};

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("payouts").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// 14.5「報酬確定・支払」。確定済み(confirmed)の報酬明細を受取者単位でまとめて支払済みにする。
// Phase1は最小限のため、payable(支払可能)を経由せず確定→支払済みへ直接遷移させる。
export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await requireManagerRole())) {
    return NextResponse.json({ error: "支払処理は本部管理者のみ実行できます" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const recipientType = body?.recipient_type;
  const recipientUserId = body?.recipient_user_id || null;
  const recipientAgentId = body?.recipient_agent_id || null;
  if (!recipientType || (!recipientUserId && !recipientAgentId)) {
    return NextResponse.json({ error: "recipient_type と recipient_user_id/recipient_agent_id は必須です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const actorName = await getAdminActorName();

  // PR-P1d。対象抽出・payouts作成・ledger更新を1トランザクションへ移し、対象行を
  // for update でロックする。以前はこの3手がAPI側に分かれており、同一受取者への
  // 同時実行で payouts が二重作成され、支払総額が二重計上されえた。
  // 詳細は supabase/migrations/20260822000001_payout_exclusivity.sql のコメント。
  const { data, error } = await supabase.rpc("create_payout_for_recipient", {
    p_recipient_type: recipientType,
    p_recipient_user_id: recipientUserId,
    p_recipient_agent_id: recipientAgentId,
    p_created_by: actorName,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data as PayoutRpcRow[] | null)?.[0];
  if (!result) return NextResponse.json({ error: "支払処理の結果を取得できませんでした" }, { status: 500 });

  if (result.outcome === "invalid_recipient") {
    return NextResponse.json({ error: "recipient_type と recipient_user_id/recipient_agent_id は必須です" }, { status: 400 });
  }
  if (result.outcome === "no_target") {
    // 同時実行の2件目もここへ来る。1件目は成功しているため実務上は正しい結果。
    return NextResponse.json(
      { error: "対象の確定済み報酬がありません", outcome: "no_target", lineCount: 0, totalAmountYen: 0 },
      { status: 400 }
    );
  }

  const totalAmountYen = Number(result.total_amount_yen);

  // 監査ログの失敗を握り潰さず、応答へ含める。支払記録自体は成功させる
  // (止めると業務が止まるため)。
  const auditLogged = await logAdminActionWithResult(
    actorName,
    "payout_create",
    `payout_id=${result.payout_id} line_count=${result.line_count} total_amount_yen=${totalAmountYen}`,
    { targetType: "payout", targetId: result.payout_id }
  );

  const { data: payout } = await supabase.from("payouts").select("*").eq("id", result.payout_id).single();

  return NextResponse.json({
    ...(payout ?? { id: result.payout_id, total_amount_yen: totalAmountYen }),
    outcome: "created",
    lineCount: result.line_count,
    totalAmountYen,
    auditLogged,
  });
}
