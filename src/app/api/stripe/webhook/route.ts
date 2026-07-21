import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPaymentSettings } from "@/lib/payment-settings";
import { completePlotPurchase } from "@/lib/plot-reservations";
import { postLandSaleCommission } from "@/lib/castle-commissions";
import { notifyPlotPurchase } from "@/lib/castle-notifications";
import { createStripeClient } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { confirmReferral } from "@/lib/common-user-hub";
import { adjustUserBalance } from "@/lib/atomic-balance";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

async function grantPurchase(userId: string, itemType: string, grantAmount: number) {
  if (itemType === "kokudaka") {
    await adjustUserBalance(userId, "kokudaka", grantAmount);
  } else if (itemType === "gacha_ticket") {
    await adjustUserBalance(userId, "gacha_tickets", grantAmount);
  }
}

// 04_mvp_spec 3.3: 紹介経由ユーザーの購入イベントを agent_sales に記録する(Phase1は記録のみ)。
// agents テーブルにユーザーとの紐付け(user_id)が無いため、「代理店自身の自己購入」を
// システム的に判別する手段が現状無い。そのためPhase1では紹介経由の購入を一律
// type='referral' として記録する(自己購入分の仕分けはPhase2で人手/追加設計により対応)。
async function recordAgentSaleIfReferred(supabase: SupabaseServerClient, userId: string, itemType: string, amountYen: number) {
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

// sengoku-ai.com EXTERNAL_DEVELOPER_GUIDE 10.2章。referral_session_keyが
// 保存されているユーザー(=紹介URL経由で登録したユーザー)の購入完了を通知する。
// ベストエフォート(confirmReferral自体がfail-open)なので、失敗しても購入処理は継続する。
async function confirmReferralForPurchase(
  supabase: SupabaseServerClient,
  userId: string,
  purchaseId: string,
  itemType: string,
  amountYen: number
) {
  const { data: user, error } = await supabase
    .from("users")
    .select("referral_session_key")
    .eq("id", userId)
    .maybeSingle();
  if (error || !user?.referral_session_key) return;

  await confirmReferral({
    referralSessionKey: user.referral_session_key,
    externalUserId: userId,
    referralSource: "purchase",
    metadata: { purchase_id: purchaseId, item_type: itemType, amount: amountYen },
  });
}

// 千ノ国パスポート 全体統合対応 実装計画(PR2)。
// purchase.statusを先にcompletedへ確定してから区画・残高・報酬を処理する旧フローは、
// 途中失敗時にWebhook再送で復旧できない問題があった(03_SEN_NO_KUNI_PASSPORT_INSTRUCTIONS
// 5.1章)。新フローはpending→processingへの原子的な遷移(同一行への guard-clause update)を
// 「権利付与ブロックを1回だけ実行する」ためのロックとして使い、実際に全ステップが成功した
// 場合のみstatus='completed'へ進める。
async function handleCheckoutSessionCompleted(supabase: SupabaseServerClient, checkoutSession: Stripe.Checkout.Session) {
  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select("id, user_id, item_type, amount, grant_amount, status, plot_id, grant_attempt_count")
    .eq("stripe_session_id", checkoutSession.id)
    .maybeSingle();
  if (purchaseError) throw purchaseError;
  if (!purchase) return; // 対応する注文行が見つからない(想定外)。再送されても状況は変わらない。

  const paymentIntentId = typeof checkoutSession.payment_intent === "string" ? checkoutSession.payment_intent : null;
  const amountReceivedYen = checkoutSession.amount_total ?? purchase.amount;

  // pending→processingへの遷移に成功した呼び出しだけが権利付与ブロックへ進む。
  // 既にprocessing/completed/failed/refundedの場合は「処理中または処理済み」とみなし、
  // 二重付与を避けるためここで終える(processingで止まっている行の復旧は管理画面から行う)。
  const { data: claimed, error: claimError } = await supabase
    .from("purchases")
    .update({ status: "processing", payment_intent_id: paymentIntentId, amount_received_yen: amountReceivedYen })
    .eq("id", purchase.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return;

  try {
    if (purchase.item_type === "land_plot") {
      // 土地区画の購入(城主プラン)。既存のkokudaka/gacha_ticket用grantPurchase()は変更しない。
      await completePlotPurchase(purchase.id);
      await postLandSaleCommission(purchase.id);
      await notifyPlotPurchase(purchase.user_id, purchase.plot_id);
    } else if (purchase.grant_amount > 0) {
      // 付与量は購入時にpurchasesへ保存した値を正とする(後からパック設定が変わっても影響を受けない)。
      await grantPurchase(purchase.user_id, purchase.item_type, purchase.grant_amount);
      await recordAgentSaleIfReferred(supabase, purchase.user_id, purchase.item_type, purchase.amount);
    }

    await confirmReferralForPurchase(supabase, purchase.user_id, purchase.id, purchase.item_type, amountReceivedYen);

    const { error: completeError } = await supabase
      .from("purchases")
      .update({ status: "completed", grant_status: "granted", granted_at: new Date().toISOString() })
      .eq("id", purchase.id);
    if (completeError) throw completeError;
  } catch (error) {
    // 権利付与ブロックの一部が失敗した場合、statusは'processing'のまま残し、
    // grant_statusで「決済は完了しているが権利付与に失敗している」ことを検出可能にする。
    // Stripe側への自動再送には頼らず、管理画面からの手動再実行(次PR)で復旧する想定のため、
    // ここで例外を再送出しない(Webhook自体は正常受信として扱う)。
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`購入(${purchase.id})の権利付与処理に失敗しました`, error);
    await supabase
      .from("purchases")
      .update({
        grant_status: "failed",
        grant_last_error: message,
        grant_attempt_count: (purchase.grant_attempt_count ?? 0) + 1,
      })
      .eq("id", purchase.id);
  }
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

  const supabase = createSupabaseServerClient();

  // Stripe event inbox。stripe_event_idのunique制約でWebhook再送時の二重処理を検知する。
  const { data: existingInboxEvent, error: inboxFetchError } = await supabase
    .from("stripe_webhook_events")
    .select("id, status, attempt_count")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (inboxFetchError) throw inboxFetchError;

  if (existingInboxEvent?.status === "succeeded") {
    return NextResponse.json({ received: true }); // 処理済みイベントの再送(冪等)。
  }

  let inboxEventId: string;
  if (existingInboxEvent) {
    inboxEventId = existingInboxEvent.id as string;
    await supabase
      .from("stripe_webhook_events")
      .update({ status: "processing", attempt_count: (existingInboxEvent.attempt_count ?? 0) + 1 })
      .eq("id", inboxEventId);
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("stripe_webhook_events")
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        payload: event as unknown as Record<string, unknown>,
        status: "processing",
        attempt_count: 1,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    inboxEventId = inserted.id as string;
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutSessionCompleted(supabase, event.data.object as Stripe.Checkout.Session);
    }

    await supabase
      .from("stripe_webhook_events")
      .update({ status: "succeeded", processed_at: new Date().toISOString() })
      .eq("id", inboxEventId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await supabase.from("stripe_webhook_events").update({ status: "failed", last_error: message }).eq("id", inboxEventId);
    console.error("Stripe webhook処理に失敗しました", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
