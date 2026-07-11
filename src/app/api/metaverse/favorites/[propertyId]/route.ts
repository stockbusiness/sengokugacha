import { NextRequest, NextResponse } from "next/server";
import { removeFavorite } from "@/lib/metaverse";
import { getSession } from "@/lib/session";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ propertyId: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { propertyId } = await params;
  await removeFavorite(session.userId, propertyId);
  return NextResponse.json({ ok: true });
}
