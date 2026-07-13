import {
  computeLandSaleCommissionLines,
  computeRefundAdjustments,
  type CommissionLine,
  type ExistingLedgerLine,
  type RecipientType,
} from "@/lib/castle-commission-engine";
import { getCastleLordPlanSettings } from "@/lib/castle-lord-plan-settings";
import { getCurrentPublishedRuleSet } from "@/lib/commission-rule-sets";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 8.1「入金額」から「報酬計算対象額」への変換。価格は税込表示のため、
// 税抜換算額 = 入金額 ÷ 1.1 とする(Phase1では対象外手数料は常に0、返金は
// 別注文として都度applyRefundAdjustmentsで処理するためここでは差し引かない)。
function toBaseAmountYen(amountReceivedYen: number): number {
  return Math.round(amountReceivedYen / 1.1);
}

// Stripe決済確定(checkout.session.completed)時に呼ばれる。土地区画の購入1件について、
// 報酬元帳(commission_ledger)へ必要な明細行を書き込む。冪等性は「purchase.status
// ガード(webhook側)」+「commission_ledgerの部分ユニークインデックス」の二重で担保する。
export async function postLandSaleCommission(purchaseId: string): Promise<void> {
  const supabase = createSupabaseServerClient();

  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select("id, plot_id, selling_agent_id, amount_received_yen, amount")
    .eq("id", purchaseId)
    .maybeSingle();
  if (purchaseError) throw purchaseError;
  if (!purchase || !purchase.plot_id) return;

  const { data: plot, error: plotError } = await supabase
    .from("castle_plots")
    .select("id, castle_id")
    .eq("id", purchase.plot_id)
    .maybeSingle();
  if (plotError) throw plotError;
  if (!plot) return;

  const ruleSet = await getCurrentPublishedRuleSet();
  if (!ruleSet) {
    console.error("公開済みの報酬ルールセットが存在しないため、報酬計上をスキップしました", { purchaseId });
    return;
  }

  const settings = await getCastleLordPlanSettings();

  const { data: contract } = await supabase
    .from("castle_lord_contracts")
    .select("id, applicant_user_id, status")
    .eq("castle_id", plot.castle_id)
    .eq("status", "active")
    .maybeSingle();

  let sellingAgent = null;
  if (purchase.selling_agent_id) {
    const { data: agent } = await supabase
      .from("agents")
      .select("id, rank, parent_agent_id")
      .eq("id", purchase.selling_agent_id)
      .maybeSingle();
    if (agent) {
      sellingAgent = { agentId: agent.id as string, rank: agent.rank as string, parentAgentId: (agent.parent_agent_id as string | null) ?? null };
    }
  }

  const { data: existingLines } = await supabase
    .from("commission_ledger")
    .select("recipient_type")
    .eq("purchase_id", purchaseId)
    .is("reversal_of_ledger_id", null);
  const existingRecipientTypes = new Set((existingLines ?? []).map((l) => l.recipient_type as RecipientType));

  const baseAmountYen = toBaseAmountYen(purchase.amount_received_yen ?? purchase.amount);

  const lines = computeLandSaleCommissionLines({
    baseAmountYen,
    rateSet: ruleSet,
    lordContract: contract ? { contractId: contract.id as string, lordUserId: contract.applicant_user_id as string, status: contract.status as string } : null,
    sellingAgent,
    minRankForCommission: settings.min_agent_rank_for_commission,
    retroactivePayoutEnabled: settings.retroactive_payout_enabled,
    existingRecipientTypes,
  });

  if (lines.length === 0) return;

  const rows = lines.map((line: CommissionLine) => ({
    purchase_id: purchaseId,
    plot_id: plot.id,
    castle_id: plot.castle_id,
    contract_id: contract?.id ?? null,
    rule_set_id: ruleSet.id,
    recipient_type: line.recipientType,
    recipient_user_id: line.recipientUserId,
    recipient_agent_id: line.recipientAgentId,
    base_amount_yen: baseAmountYen,
    rate: line.rate,
    amount_yen: line.amountYen,
    status: "held",
  }));

  const { error: insertError } = await supabase.from("commission_ledger").insert(rows);
  // 部分ユニークインデックス違反=既に計上済み(Webhook重複送信、8.7 TC7)なので無視する。
  if (insertError && insertError.code !== "23505") throw insertError;
}

// 8.5「報酬確定条件」。Cron基盤が無いため、管理者が確定操作を行った時点で
// 猶予期間(取消・返金期間)経過をチェックして確定する。
export async function confirmMaturedCommissions(actorName: string | null): Promise<{ confirmedCount: number }> {
  const supabase = createSupabaseServerClient();
  const settings = await getCastleLordPlanSettings();
  const graceMs = settings.commission_confirmation_grace_days * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - graceMs).toISOString();

  const { data: heldLines, error } = await supabase
    .from("commission_ledger")
    .select("id, created_at")
    .eq("status", "held")
    .lte("created_at", cutoff);
  if (error) throw error;
  if (!heldLines || heldLines.length === 0) return { confirmedCount: 0 };

  const ids = heldLines.map((l) => l.id as string);
  const { error: updateError } = await supabase
    .from("commission_ledger")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .in("id", ids);
  if (updateError) throw updateError;

  void actorName; // 監査ログはAPIルート側でlogAdminActionにより記録する
  return { confirmedCount: ids.length };
}

// 8.6「返金・取消」。確定前(pending/held)の行は取消、確定後・支払後(confirmed/payable/paid)の
// 行は反対仕訳を新規作成する。
export async function applyRefundAdjustments(
  purchaseId: string,
  refundAmountYen: number,
  stripeRefundId: string | null,
  actorName: string | null
): Promise<void> {
  const supabase = createSupabaseServerClient();

  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select("amount_received_yen, amount")
    .eq("id", purchaseId)
    .maybeSingle();
  if (purchaseError) throw purchaseError;
  if (!purchase) return;

  const { data: existing, error: existingError } = await supabase
    .from("commission_ledger")
    .select(
      "id, recipient_type, recipient_user_id, recipient_agent_id, amount_yen, status, rule_set_id, plot_id, castle_id, contract_id"
    )
    .eq("purchase_id", purchaseId)
    .is("reversal_of_ledger_id", null);
  if (existingError) throw existingError;
  if (!existing || existing.length === 0) return;

  const baseAmountYen = toBaseAmountYen(purchase.amount_received_yen ?? purchase.amount);
  const refundBaseAmountYen = toBaseAmountYen(refundAmountYen);

  const existingLines: ExistingLedgerLine[] = existing.map((l) => ({
    id: l.id as string,
    recipientType: l.recipient_type as RecipientType,
    amountYen: l.amount_yen as number,
    status: l.status as ExistingLedgerLine["status"],
  }));

  const { cancelLineIds, reversalLines } = computeRefundAdjustments({
    existingLines,
    refundAmountYen: refundBaseAmountYen,
    baseAmountYen,
  });

  if (cancelLineIds.length > 0) {
    const { error: cancelError } = await supabase
      .from("commission_ledger")
      .update({ status: "reversed" })
      .in("id", cancelLineIds);
    if (cancelError) throw cancelError;

    const adjustmentRows = cancelLineIds.map((ledgerId) => {
      const original = existingLines.find((l) => l.id === ledgerId)!;
      return {
        ledger_id: ledgerId,
        adjustment_type: "cancel" as const,
        amount_yen: -original.amountYen,
        reason: "確定前の返金による取消",
        stripe_refund_id: stripeRefundId,
        created_by: actorName,
      };
    });
    const { error: adjError } = await supabase.from("commission_adjustments").insert(adjustmentRows);
    if (adjError) throw adjError;
  }

  for (const reversal of reversalLines) {
    // 反対仕訳行は元行の受取者・城・区画・ルールセット等の識別情報をそのまま引き継ぐ
    // (金額のみ符号反転)。8.6「元の報酬行を削除せず、調整台帳を残す」に対応。
    const original = existing.find((l) => l.id === reversal.originalLineId)!;
    const { data: newLine, error: insertError } = await supabase
      .from("commission_ledger")
      .insert({
        purchase_id: purchaseId,
        plot_id: original.plot_id,
        castle_id: original.castle_id,
        contract_id: original.contract_id,
        rule_set_id: original.rule_set_id,
        recipient_type: reversal.recipientType,
        recipient_user_id: original.recipient_user_id,
        recipient_agent_id: original.recipient_agent_id,
        base_amount_yen: baseAmountYen,
        rate: 0,
        amount_yen: reversal.amountYen,
        status: "reversed",
        reversal_of_ledger_id: reversal.originalLineId,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    const { error: adjError } = await supabase.from("commission_adjustments").insert({
      ledger_id: reversal.originalLineId,
      reversal_ledger_id: newLine.id,
      adjustment_type: "reversal",
      amount_yen: reversal.amountYen,
      reason: "確定・支払後の返金による反対仕訳",
      stripe_refund_id: stripeRefundId,
      created_by: actorName,
    });
    if (adjError) throw adjError;
  }
}
