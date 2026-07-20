import { NextRequest, NextResponse } from "next/server";
import { captureReferral } from "@/lib/common-user-hub";

// sengoku-ai.com側のAPIキーをクライアントに渡さないための中継エンドポイント。
// EXTERNAL_DEVELOPER_GUIDE 10.1章。LIFF初期化時に紹介URL(?ref=)を検知した
// 時点で呼ばれる。失敗してもnullを返すのみで、ログイン処理自体は継続する。
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const referralToken = typeof body?.referralToken === "string" && body.referralToken.length > 0 ? body.referralToken : null;

  if (!referralToken) {
    return NextResponse.json({ sessionKey: null });
  }

  const sessionKey = await captureReferral(referralToken);
  return NextResponse.json({ sessionKey });
}
