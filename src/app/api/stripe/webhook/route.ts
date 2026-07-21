import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPaymentSettings } from "@/lib/payment-settings";
import { createStripeClient } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { runPurchaseGrant } from "@/lib/purchase-grants";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// 千ノ国パスポート 全体統合対応 実装計画(PR2)。
// purchase.statusを先にcompletedへ確定してから区画・残高・報酬を処理する旧フローは、
// 途中失敗時にWebhook再送で復旧できない問題があった(03_SEN_NO_KUNI_PASSPORT_INSTRUCTIONS
// 5.1章)。新フローはpending→processingへの原子的な遷移(同一行への guard-clause update)を
// 「権利付与ブロックを1回だけ実行する」ためのロックとして使い、実際に全ステップが成功した
// 場合のみstatus='completed'へ進める(実際の権利付与処理はsrc/lib/purchase-grants.tsに
// 切り出し、管理画面からの手動再実行(PR3)と共通化している)。
async function handleCheckoutSessionCompleted(supabase: SupabaseServerClient, checkoutSession: Stripe.Checkout.Session) {
  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select("id, status")
    .eq("stripe_session_id", checkoutSession.id)
    .maybeSingle();
  if (purchaseError) throw purchaseError;
  if (!purchase) return; // 対応する注文行が見つからない(想定外)。再送されても状況は変わらない。

  const paymentIntentId = typeof checkoutSession.payment_intent === "string" ? checkoutSession.payment_intent : null;
  const amountReceivedYen = checkoutSession.amount_total ?? undefined;

  // pending→processingへの遷移に成功した呼び出しだけが権利付与ブロックへ進む。
  // 既にprocessing/completed/failed/refundedの場合は「処理中または処理済み」とみなし、
  // 二重付与を避けるためここで終える(processingで止まっている行の復旧は管理画面から行う)。
  const { data: claimed, error: claimError } = await supabase
    .from("purchases")
    .update({
      status: "processing",
      payment_intent_id: paymentIntentId,
      ...(amountReceivedYen !== undefined ? { amount_received_yen: amountReceivedYen } : {}),
    })
    .eq("id", purchase.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return;

  try {
    await runPurchaseGrant(purchase.id);
  } catch (error) {
    // grant_statusはrunPurchaseGrant内で既に記録済み。Stripe側への自動再送には頼らず、
    // 管理画面からの手動再実行(PR3)で復旧する想定のため、ここで例外を再送出しない
    // (Webhook自体は正常受信として扱う)。
    console.error(`購入(${purchase.id})の権利付与処理に失敗しました`, error);
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
