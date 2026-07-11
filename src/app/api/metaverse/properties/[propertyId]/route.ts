import { NextRequest, NextResponse } from "next/server";
import { getPropertyById, recordRecentView } from "@/lib/metaverse";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { propertyId } = await params;
  const property = await getPropertyById(propertyId, session.userId);
  if (!property) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await recordRecentView(session.userId, propertyId);

  return NextResponse.json(property);
}
