import { NextRequest, NextResponse } from "next/server";
import { addFavorite, resolveTourSessionByToken } from "@/lib/metaverse";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  if (typeof token !== "string") {
    return NextResponse.json({ error: "token は必須です" }, { status: 400 });
  }

  const resolved = await resolveTourSessionByToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "内覧セッションが無効です" }, { status: 401 });
  }

  await addFavorite(resolved.userId, resolved.propertyId);
  return NextResponse.json({ ok: true });
}
