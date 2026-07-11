import { NextRequest, NextResponse } from "next/server";
import { addFavorite, getFavoriteProperties } from "@/lib/metaverse";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const favorites = await getFavoriteProperties(session.userId);
  return NextResponse.json(favorites);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const propertyId = body?.propertyId;
  if (typeof propertyId !== "string" || propertyId.length === 0) {
    return NextResponse.json({ error: "propertyId は必須です" }, { status: 400 });
  }

  await addFavorite(session.userId, propertyId);
  return NextResponse.json({ ok: true });
}
