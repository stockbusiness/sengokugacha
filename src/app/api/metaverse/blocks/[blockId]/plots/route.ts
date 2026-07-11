import { NextRequest, NextResponse } from "next/server";
import { getPlotsForBlock } from "@/lib/metaverse";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest, { params }: { params: Promise<{ blockId: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { blockId } = await params;
  const plots = await getPlotsForBlock(blockId);
  return NextResponse.json(plots);
}
