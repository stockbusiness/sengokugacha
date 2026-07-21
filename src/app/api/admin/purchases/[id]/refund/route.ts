import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession, requireManagerRole } from "@/lib/admin-session";
import { adjustUserBalance } from "@/lib/atomic-balance";
import { applyRefundAdjustments } from "@/lib/castle-commissions";
import { getPaymentSettings } from "@/lib/payment-settings";
import { createStripeClient } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 完了済みの購入を返金する。Stripe側の実際の返金処理に加えて、
// 付与済みの石高/ガチャ券を取り消し、購入ステータスをrefundedにする。
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();

  const { data: purchase, error: fetchError } = await supabase
    .from("purchases")
    .select("id, user_id, item_type, grant_amount, status, stripe_session_id, plot_id, amount, amount_received_yen")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!purchase) return NextResponse.json({ error: "purchase not found" }, { status: 404 });
  if (purchase.status !== "completed") {
    return NextResponse.json({ error: "完了済みの購入のみ返金できます" }, { status: 400 });
  }

  // 土地区画の返金は財務・区画在庫への影響が大きいため本部管理者のみ許可する。
  if (purchase.item_type === "land_plot" && !(await requireManagerRole())) {
    return NextResponse.json({ error: "土地区画の返金は本部管理者のみ実行できます" }, { status: 403 });
  }

  const settings = await getPaymentSettings();
  let stripeRefundId: string | null = null;
  if (settings?.stripe_secret_key) {
    try {
      const stripe = createStripeClient(settings.stripe_secret_key);
      const checkoutSession = await stripe.checkout.sessions.retrieve(purchase.stripe_session_id);
      const paymentIntentId =
        typeof checkoutSession.payment_intent === "string"
          ? checkoutSession.payment_intent
          : checkoutSession.payment_intent?.id;
      if (paymentIntentId) {
        const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
        stripeRefundId = refund.id;
      }
    } catch (error) {
      console.error("Stripe側の返金処理に失敗しました", error);
      return NextResponse.json(
        { error: "Stripe側の返金処理に失敗しました。Stripeダッシュボードで状態をご確認ください。" },
        { status: 502 }
      );
    }
  }

  const actorName = await getAdminActorName();

  if (purchase.item_type === "land_plot") {
    // 区画を再度販売可能へ戻す(要件書8.6の反対仕訳/取消と連動)。
    if (purchase.plot_id) {
      const { error: plotError } = await supabase
        .from("castle_plots")
        .update({ status: "available", owner_user_id: null, sold_at: null, sold_price_yen: null, updated_at: new Date().toISOString() })
        .eq("id", purchase.plot_id);
      if (plotError) return NextResponse.json({ error: plotError.message }, { status: 500 });
    }

    const refundAmountYen = purchase.amount_received_yen ?? purchase.amount;
    await applyRefundAdjustments(id, refundAmountYen, stripeRefundId, actorName);

    const { data: updated, error: updateError } = await supabase
      .from("purchases")
      .update({ status: "refunded", refunded_amount_yen: refundAmountYen })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await logAdminAction(actorName, "purchase_refund", `purchase_id=${id} user_id=${purchase.user_id} item_type=land_plot`);
    return NextResponse.json(updated);
  }

  // 付与済みアイテムを原子的に取り消す(既に使用済みで残高が足りない場合は0までしか引かない。
  // 全体統合対応 実装計画PR2でread-modify-write競合を解消)。
  const column = purchase.item_type === "kokudaka" ? "kokudaka" : "gacha_tickets";
  try {
    await adjustUserBalance(purchase.user_id, column, -purchase.grant_amount);
  } catch (error) {
    const message = error instanceof Error ? error.message : "残高の取消に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("purchases")
    .update({ status: "refunded" })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await logAdminAction(
    actorName,
    "purchase_refund",
    `purchase_id=${id} user_id=${purchase.user_id} item_type=${purchase.item_type} grant_amount=${purchase.grant_amount}`
  );

  return NextResponse.json(updated);
}
