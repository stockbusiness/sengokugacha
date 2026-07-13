import { NextRequest, NextResponse } from "next/server";
import { PlotNotAvailableError, reservePlot } from "@/lib/plot-reservations";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const referralCode = typeof body?.ref === "string" && body.ref.trim() ? body.ref.trim() : null;

  try {
    const reservation = await reservePlot(id, session.userId, referralCode);
    return NextResponse.json(reservation);
  } catch (error) {
    if (error instanceof PlotNotAvailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "予約に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
