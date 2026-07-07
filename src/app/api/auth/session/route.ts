import { NextResponse } from "next/server";
import { recordLoginToday } from "@/lib/passport";
import { getSession } from "@/lib/session";

// 既存のセッションCookieが有効かどうかをLINE側への再検証なしに確認するための
// 軽量エンドポイント。有効な場合は本日分の登城ログもここで記録する
// (LINEのIDトークン検証を経由しない再訪問でも連続登城ボーナスが継続するように)。
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  await recordLoginToday(session.userId);
  return NextResponse.json({ authenticated: true });
}
