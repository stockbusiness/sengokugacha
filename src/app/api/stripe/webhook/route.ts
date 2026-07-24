import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPaymentSettings } from "@/lib/payment-settings";
import { createStripeClient } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { processStripeWebhookEvent } from "@/modules/commerce/application/process-stripe-webhook-event";
import { SupabaseStripeInboxRepository } from "@/modules/commerce/infrastructure/supabase-stripe-inbox-repository";
import { SupabasePurchaseRepository } from "@/modules/commerce/infrastructure/supabase-purchase-repository";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase B-1(commerceモジュール、PR3)。
// イベント処理本体(inboxの原子的claim・purchases.processing遷移・runPurchaseGrant()呼び出し)は
// src/modules/commerce/application/process-stripe-webhook-event.tsへ移設した。本ルートは
// Stripe署名検証とHTTPレスポンスへの変換のみを行う薄い層として残す。
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
  const claimToken = crypto.randomUUID();
  const result = await processStripeWebhookEvent(
    new SupabaseStripeInboxRepository(supabase),
    new SupabasePurchaseRepository(supabase),
    event,
    claimToken
  );

  if (result.outcome === "failed") {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
