import { NextRequest, NextResponse } from "next/server";
import { getPropertyScenes } from "@/lib/metaverse";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { propertyId } = await params;
  const scenes = await getPropertyScenes(propertyId);
  return NextResponse.json(scenes);
}
