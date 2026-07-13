import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPaymentSettings } from "@/lib/payment-settings";
import { completePlotPurchase } from "@/lib/plot-reservations";
import { notifyPlotPurchase } from "@/lib/castle-notifications";
import { createStripeClient } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase-server";

async function grantPurchase(userId: string, itemType: string, grantAmount: number) {
  const supabase = createSupabaseServerClient();

  if (itemType === "kokudaka") {
    const { data: user, error } = await supabase.from("users").select("kokudaka").eq("id", userId).single();
    if (error) throw error;
    const { error: updateError } = await supabase
      .from("users")
      .update({ kokudaka: user.kokudaka + grantAmount })
      .eq("id", userId);
    if (updateError) throw updateError;
  } else if (itemType === "gacha_ticket") {
    const { data: user, error } = await supabase.from("users").select("gacha_tickets").eq("id", userId).single();
    if (error) throw error;
    const { error: updateError } = await supabase
      .from("users")
      .update({ gacha_tickets: user.gacha_tickets + grantAmount })
      .eq("id", userId);
    if (updateError) throw updateError;
  }
}

// 04_mvp_spec 3.3: 紹介経由ユーザーの購入イベントを agent_sales に記録する(Phase1は記録のみ)。
// agents テーブルにユーザーとの紐付け(user_id)が無いため、「代理店自身の自己購入」を
// システム的に判別する手段が現状無い。そのためPhase1では紹介経由の購入を一律
// type='referral' として記録する(自己購入分の仕分けはPhase2で人手/追加設計により対応)。
async function recordAgentSaleIfReferred(userId: string, itemType: string, amountYen: number) {
  const supabase = createSupabaseServerClient();

  const { data: user, error } = await supabase
    .from("users")
    .select("referring_agent_id")
    .eq("id", userId)
    .single();
  if (error) throw error;
  if (!user.referring_agent_id) return;

  const { error: insertError } = await supabase.from("agent_sales").insert({
    agent_id: user.referring_agent_id,
    buyer_user_id: userId,
    amount: amountYen,
    type: "referral",
    source: itemType,
  });
  if (insertError) throw insertError;
}

export async function POST(request: NextRequest) {
  const settings = await getPaymentSettings();
  if (!settings?.stripe_secret_key || !settings.stripe_webhook_secret) {
    return NextResponse.json({ error: "Stripeが設定されていません" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = createStripeClient(settings.stripe_secret_key);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, settings.stripe_webhook_secret);
  } catch (error) {
    console.error("Stripe webhook署名検証に失敗しました", error);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const checkoutSession = event.data.object as Stripe.Checkout.Session;

    const supabase = createSupabaseServerClient();
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .select("id, user_id, item_type, amount, grant_amount, status, plot_id")
      .eq("stripe_session_id", checkoutSession.id)
      .maybeSingle();
    if (purchaseError) throw purchaseError;

    // Stripeはイベントを再送することがあるため、完了済みなら何もしない(冪等)。
    if (purchase && purchase.status !== "completed") {
      const paymentIntentId =
        typeof checkoutSession.payment_intent === "string" ? checkoutSession.payment_intent : null;

      if (purchase.item_type === "land_plot") {
        // 土地区画の購入(城主プラン)。既存のkokudaka/gacha_ticket用grantPurchase()は
        // 変更せず、区画・予約の更新のみここで行う。報酬元帳への計上はPR8で追加する。
        await completePlotPurchase(purchase.id);
        await notifyPlotPurchase(purchase.user_id, purchase.plot_id);
      } else if (purchase.grant_amount > 0) {
        // 付与量は購入時にpurchasesへ保存した値を正とする(後からパック設定が変わっても影響を受けない)。
        await grantPurchase(purchase.user_id, purchase.item_type, purchase.grant_amount);
        await recordAgentSaleIfReferred(purchase.user_id, purchase.item_type, purchase.amount);
      }

      const { error: statusError } = await supabase
        .from("purchases")
        .update({
          status: "completed",
          payment_intent_id: paymentIntentId,
          amount_received_yen: checkoutSession.amount_total ?? purchase.amount,
        })
        .eq("id", purchase.id);
      if (statusError) throw statusError;
    }
  }

  return NextResponse.json({ received: true });
}
