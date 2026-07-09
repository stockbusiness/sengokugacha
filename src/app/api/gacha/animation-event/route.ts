import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 仕様書17章の分析イベント。演出の再生状況を記録するだけの補助的なログのため、
// 記録失敗はクライアントの結果表示に一切影響させない(常に200を返す)。
const EVENT_TYPES = new Set([
  "gacha_video_load_started",
  "gacha_video_started",
  "gacha_video_completed",
  "gacha_video_skipped",
  "gacha_video_failed",
  "gacha_result_revealed",
  "gacha_result_closed",
]);

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const eventType = body?.eventType;
  if (typeof eventType !== "string" || !EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ error: "invalid eventType" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServerClient();
    await supabase.from("gacha_animation_events").insert({
      user_id: session.userId,
      gacha_log_id: body.drawLogId ?? null,
      animation_asset_id: body.animationAssetId ?? null,
      animation_key: body.animationKey ?? null,
      event_type: eventType,
      rarity: body.rarity ?? null,
      playback_ms: typeof body.playbackMs === "number" ? Math.round(body.playbackMs) : null,
      error_code: body.errorCode ?? null,
      user_agent: request.headers.get("user-agent"),
      is_liff: !!body.isLiff,
    });
  } catch (error) {
    console.error("ガチャ動画分析イベントの記録に失敗しました", error);
  }

  return NextResponse.json({ ok: true });
}
