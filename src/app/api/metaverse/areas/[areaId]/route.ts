import { NextRequest, NextResponse } from "next/server";
import { getAreaById } from "@/lib/metaverse";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest, { params }: { params: Promise<{ areaId: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { areaId } = await params;
  const area = await getAreaById(areaId);
  if (!area) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(area);
}
