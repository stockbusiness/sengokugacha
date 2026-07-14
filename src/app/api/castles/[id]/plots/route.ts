import { NextResponse } from "next/server";
import { getCastleUnlockStatus } from "@/lib/castle-unlock";
import { getCastleById } from "@/lib/castles";
import { getPublicPlotsForCastle } from "@/lib/castle-plots";
import { getSession } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const castle = await getCastleById(id);
  if (!castle || (castle.status !== "recruiting" && castle.status !== "published")) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const unlocked = await getCastleUnlockStatus(session.userId, id);
  if (!unlocked) return NextResponse.json([]);

  const plots = await getPublicPlotsForCastle(id);
  return NextResponse.json(plots);
}
