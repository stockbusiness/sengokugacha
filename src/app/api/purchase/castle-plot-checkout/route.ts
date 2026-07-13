import { NextRequest, NextResponse } from "next/server";
import { getPaymentSettings, isStripeConfigured } from "@/lib/payment-settings";
import { getPendingReservation, linkPurchaseToReservation } from "@/lib/plot-reservations";
import { getSession } from "@/lib/session";
import { createStripeClient } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const reservationId = typeof body?.reservationId === "string" ? body.reservationId : null;
  if (!reservationId) {
    return NextResponse.json({ error: "reservationId は必須です" }, { status: 400 });
  }

  const reservation = await getPendingReservation(reservationId, session.userId);
  if (!reservation) {
    return NextResponse.json({ error: "予約が見つからないか、期限切れです" }, { status: 404 });
  }

  const supabase = createSupabaseServerClient();
  const { data: plot, error: plotError } = await supabase
    .from("castle_plots")
    .select("id, name, price_yen, status")
    .eq("id", reservation.plotId)
    .maybeSingle();
  if (plotError) return NextResponse.json({ error: plotError.message }, { status: 500 });
  if (!plot || plot.status !== "reserved") {
    return NextResponse.json({ error: "この区画は現在お申込みいただけません" }, { status: 409 });
  }

  const settings = await getPaymentSettings();
  if (!isStripeConfigured(settings)) {
    return NextResponse.json({ error: "Stripeが設定されていません" }, { status: 503 });
  }

  const stripe = createStripeClient(settings.stripe_secret_key);
  const origin = request.nextUrl.origin;

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "jpy",
          product_data: { name: `土地区画: ${plot.name}` },
          unit_amount: plot.price_yen,
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/castles/${body?.castleId ?? ""}/plots/${plot.id}`,
    metadata: {
      userId: session.userId,
      itemType: "land_plot",
      plotId: plot.id,
      reservationId: reservation.id,
    },
  });

  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .insert({
      user_id: session.userId,
      stripe_session_id: checkoutSession.id,
      item_type: "land_plot",
      amount: plot.price_yen,
      grant_amount: 0,
      status: "pending",
      plot_id: plot.id,
      selling_agent_id: reservation.sellingAgentId,
    })
    .select("id")
    .single();
  if (purchaseError) return NextResponse.json({ error: purchaseError.message }, { status: 500 });

  await linkPurchaseToReservation(reservation.id, purchase.id as string);

  return NextResponse.json({ url: checkoutSession.url });
}
