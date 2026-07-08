import { NextRequest, NextResponse } from "next/server";
import { getPaymentSettings, isStripeConfigured } from "@/lib/payment-settings";
import { getMonthlySpentYen } from "@/lib/purchases";
import { getSession } from "@/lib/session";
import { createStripeClient } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type ItemType = "kokudaka" | "gacha_ticket";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const itemType: ItemType | undefined = body?.itemType;
  if (itemType !== "kokudaka" && itemType !== "gacha_ticket") {
    return NextResponse.json({ error: "invalid itemType" }, { status: 400 });
  }

  const settings = await getPaymentSettings();
  if (!isStripeConfigured(settings)) {
    return NextResponse.json({ error: "Stripeが設定されていません" }, { status: 503 });
  }

  const isKokudaka = itemType === "kokudaka";
  const amountYen = isKokudaka ? settings.kokudaka_pack_amount_yen : settings.gacha_ticket_pack_amount_yen;
  const grantAmount = isKokudaka ? settings.kokudaka_pack_kokudaka : settings.gacha_ticket_pack_tickets;
  const productName = isKokudaka ? `石高 ${grantAmount}` : `ガチャ券 ${grantAmount}枚`;

  // 使いすぎ防止: 月間購入上限が設定されている場合、今回の購入で上限を超えるなら拒否する。
  if (settings.monthly_spending_cap_yen != null) {
    const monthlySpentYen = await getMonthlySpentYen(session.userId);
    if (monthlySpentYen + amountYen > settings.monthly_spending_cap_yen) {
      return NextResponse.json(
        {
          error: `今月のご購入上限額(¥${settings.monthly_spending_cap_yen.toLocaleString()})に達するため、これ以上のご購入はできません。上限は月が変わるとリセットされます。`,
        },
        { status: 402 }
      );
    }
  }

  const stripe = createStripeClient(settings.stripe_secret_key);
  const origin = request.nextUrl.origin;

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "jpy",
          product_data: { name: productName },
          unit_amount: amountYen,
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/purchase`,
    metadata: {
      userId: session.userId,
      itemType,
      grantAmount: String(grantAmount),
    },
  });

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("purchases").insert({
    user_id: session.userId,
    stripe_session_id: checkoutSession.id,
    item_type: itemType,
    amount: amountYen,
    grant_amount: grantAmount,
    status: "pending",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ url: checkoutSession.url });
}
