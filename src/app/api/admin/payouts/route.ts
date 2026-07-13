import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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
  let query = supabase
    .from("commission_ledger")
    .select("id, amount_yen")
    .eq("recipient_type", recipientType)
    .eq("status", "confirmed")
    .is("payout_id", null);
  query = recipientUserId ? query.eq("recipient_user_id", recipientUserId) : query.eq("recipient_agent_id", recipientAgentId);

  const { data: lines, error: linesError } = await query;
  if (linesError) return NextResponse.json({ error: linesError.message }, { status: 500 });
  if (!lines || lines.length === 0) {
    return NextResponse.json({ error: "対象の確定済み報酬がありません" }, { status: 400 });
  }

  const totalAmountYen = lines.reduce((sum, l) => sum + (l.amount_yen as number), 0);
  const actorName = await getAdminActorName();
  const nowIso = new Date().toISOString();

  const { data: payout, error: payoutError } = await supabase
    .from("payouts")
    .insert({
      recipient_type: recipientType,
      recipient_user_id: recipientUserId,
      recipient_agent_id: recipientAgentId,
      total_amount_yen: totalAmountYen,
      status: "paid",
      paid_at: nowIso,
      created_by: actorName,
    })
    .select("*")
    .single();
  if (payoutError) return NextResponse.json({ error: payoutError.message }, { status: 500 });

  const { error: updateError } = await supabase
    .from("commission_ledger")
    .update({ status: "paid", payout_id: payout.id, paid_at: nowIso })
    .in("id", lines.map((l) => l.id));
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await logAdminAction(actorName, "payout_create", `payout_id=${payout.id} total_amount_yen=${totalAmountYen}`);

  return NextResponse.json(payout);
}
