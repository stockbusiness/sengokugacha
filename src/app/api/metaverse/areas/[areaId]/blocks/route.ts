import { NextRequest, NextResponse } from "next/server";
import { getBlocksForArea } from "@/lib/metaverse";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest, { params }: { params: Promise<{ areaId: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { areaId } = await params;
  const blocks = await getBlocksForArea(areaId);
  return NextResponse.json(blocks);
}
