import { NextRequest, NextResponse } from "next/server";
import { recordViewEvent, resolveTourSessionByToken } from "@/lib/metaverse";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  const eventType = body?.eventType;
  if (typeof token !== "string" || typeof eventType !== "string" || eventType.length === 0) {
    return NextResponse.json({ error: "token, eventType は必須です" }, { status: 400 });
  }

  const resolved = await resolveTourSessionByToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "内覧セッションが無効です" }, { status: 401 });
  }

  await recordViewEvent({
    sessionId: resolved.sessionId,
    userId: resolved.userId,
    eventType,
    propertyId: resolved.propertyId,
    sceneId: typeof body?.sceneId === "string" ? body.sceneId : null,
  }).catch(() => {
    /* 閲覧ログの記録失敗は内覧体験に影響させない */
  });

  return NextResponse.json({ ok: true });
}
