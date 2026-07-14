import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { assignPlotToOrderItem, PlotNotAssignableError } from "@/lib/external-orders";

// 区画割当(7章)。
export async function POST(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { itemId } = await params;
  const body = await request.json().catch(() => null);
  const plotId = typeof body?.plot_id === "string" ? body.plot_id : null;
  if (!plotId) return NextResponse.json({ error: "plot_id は必須です" }, { status: 400 });

  try {
    await assignPlotToOrderItem(itemId, plotId, await getAdminActorName());
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PlotNotAssignableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "区画割当に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
