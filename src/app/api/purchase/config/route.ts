import { NextResponse } from "next/server";
import { getPaymentSettings, isStripeConfigured } from "@/lib/payment-settings";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getPaymentSettings();

  return NextResponse.json({
    stripeConfigured: isStripeConfigured(settings),
    kokudakaPackAmountYen: settings?.kokudaka_pack_amount_yen ?? 500,
    kokudakaPackKokudaka: settings?.kokudaka_pack_kokudaka ?? 500,
    gachaTicketPackAmountYen: settings?.gacha_ticket_pack_amount_yen ?? 150,
    gachaTicketPackTickets: settings?.gacha_ticket_pack_tickets ?? 1,
  });
}
