import { NextResponse } from "next/server";
import { getPublicPlotById, getTourPropertyForPlot } from "@/lib/castle-plots";
import { getCastleById } from "@/lib/castles";
import { getSession } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const plot = await getPublicPlotById(id);
  if (!plot) return NextResponse.json({ error: "not found" }, { status: 404 });

  const castle = await getCastleById(plot.castle_id);
  if (!castle || (castle.status !== "recruiting" && castle.status !== "published")) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // 内覧物件が紐づいていれば、区画詳細から既存の内覧導線へ送れるようにする。
  const tourProperty = await getTourPropertyForPlot(plot.property_id);

  return NextResponse.json({ ...plot, castleName: castle.name, tourProperty });
}
