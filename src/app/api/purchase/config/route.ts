import { NextResponse } from "next/server";
import { getPaymentSettings, isStripeConfigured } from "@/lib/payment-settings";
import { getMonthlySpentYen } from "@/lib/purchases";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [settings, monthlySpentYen] = await Promise.all([
    getPaymentSettings(),
    getMonthlySpentYen(session.userId),
  ]);

  return NextResponse.json({
    stripeConfigured: isStripeConfigured(settings),
    kokudakaPackAmountYen: settings?.kokudaka_pack_amount_yen ?? 500,
    kokudakaPackKokudaka: settings?.kokudaka_pack_kokudaka ?? 500,
    gachaTicketPackAmountYen: settings?.gacha_ticket_pack_amount_yen ?? 150,
    gachaTicketPackTickets: settings?.gacha_ticket_pack_tickets ?? 1,
    monthlySpentYen,
    monthlySpendingCapYen: settings?.monthly_spending_cap_yen ?? null,
  });
}
