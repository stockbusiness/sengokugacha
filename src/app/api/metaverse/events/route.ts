import { NextRequest, NextResponse } from "next/server";
import { recordViewEvent } from "@/lib/metaverse";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const eventType = body?.eventType;
  if (typeof eventType !== "string" || eventType.length === 0) {
    return NextResponse.json({ error: "eventType は必須です" }, { status: 400 });
  }

  await recordViewEvent({
    userId: session.userId,
    eventType,
    propertyId: typeof body?.propertyId === "string" ? body.propertyId : null,
    sceneId: typeof body?.sceneId === "string" ? body.sceneId : null,
  }).catch(() => {
    /* 閲覧ログの記録失敗はユーザー体験に影響させない */
  });

  return NextResponse.json({ ok: true });
}
