import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { broadcastMessage } from "@/lib/line-broadcast";
import { getLineSettings } from "@/lib/line-settings";

const MAX_LENGTH = 5000;

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const text = body?.text;

  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "配信するメッセージを入力してください" }, { status: 400 });
  }
  if (text.length > MAX_LENGTH) {
    return NextResponse.json({ error: `メッセージは${MAX_LENGTH}文字以内にしてください` }, { status: 400 });
  }

  const settings = await getLineSettings();
  if (!settings?.messaging_channel_access_token) {
    return NextResponse.json({ error: "Messaging APIのチャネルアクセストークンが未設定です" }, { status: 400 });
  }

  try {
    await broadcastMessage(settings.messaging_channel_access_token, text);
  } catch (error) {
    console.error("LINE一斉配信に失敗しました", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "配信に失敗しました" },
      { status: 502 }
    );
  }

  await logAdminAction(
    await getAdminActorName(),
    "line_broadcast_send",
    `length=${text.length} preview=${text.slice(0, 50)}`
  );

  return NextResponse.json({ ok: true });
}
