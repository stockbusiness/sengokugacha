import { NextResponse } from "next/server";
import { getPublicPlotById } from "@/lib/castle-plots";
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

  return NextResponse.json({ ...plot, castleName: castle.name });
}
