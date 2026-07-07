import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getPaymentSettings } from "@/lib/payment-settings";
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
    const { userId, itemType, grantAmount } = checkoutSession.metadata ?? {};

    if (userId && itemType && grantAmount) {
      const supabase = createSupabaseServerClient();

      const { data: purchase, error: purchaseError } = await supabase
        .from("purchases")
        .select("status")
        .eq("stripe_session_id", checkoutSession.id)
        .maybeSingle();
      if (purchaseError) throw purchaseError;

      // Stripeはイベントを再送することがあるため、完了済みなら何もしない(冪等)。
      if (purchase && purchase.status !== "completed") {
        await grantPurchase(userId, itemType, Number(grantAmount));
        const { error: statusError } = await supabase
          .from("purchases")
          .update({ status: "completed" })
          .eq("stripe_session_id", checkoutSession.id);
        if (statusError) throw statusError;
      }
    }
  }

  return NextResponse.json({ received: true });
}
