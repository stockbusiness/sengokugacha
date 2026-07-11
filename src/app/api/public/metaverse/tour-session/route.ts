import { NextRequest, NextResponse } from "next/server";
import { validateTourSession } from "@/lib/metaverse";

const EXPIRED_MESSAGE = "内覧用リンクの有効期限が切れました。LINEの戦国パスポートから、もう一度内覧を開いてください。";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: EXPIRED_MESSAGE }, { status: 401 });
  }

  const session = await validateTourSession(token);
  if (!session) {
    return NextResponse.json({ error: EXPIRED_MESSAGE }, { status: 401 });
  }

  // 個人情報(userId等)はレスポンスへ含めない(指示書11章のセキュリティ要件)。
  return NextResponse.json({
    property: session.property,
    scenes: session.scenes,
  });
}
