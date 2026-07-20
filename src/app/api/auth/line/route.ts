import { NextRequest, NextResponse } from "next/server";
import { LineIdTokenVerificationError, verifyLineIdToken } from "@/lib/line";
import { findOrCreateUserByLineId, recordLoginToday, syncCommonUserHub } from "@/lib/passport";
import { setSessionCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const idToken = body?.idToken;
  const refCode = typeof body?.refCode === "string" && body.refCode.length > 0 ? body.refCode : null;
  const referralSessionKey =
    typeof body?.referralSessionKey === "string" && body.referralSessionKey.length > 0
      ? body.referralSessionKey
      : null;

  if (typeof idToken !== "string" || idToken.length === 0) {
    return NextResponse.json({ error: "idToken is required" }, { status: 400 });
  }

  try {
    const verified = await verifyLineIdToken(idToken);
    const { userId, isNewUser } = await findOrCreateUserByLineId(
      verified.sub,
      verified.name ?? null,
      refCode,
      referralSessionKey
    );
    await recordLoginToday(userId);
    await setSessionCookie({ userId });

    // 共通顧客ID解決・紹介確定はベストエフォート。失敗してもログイン自体は成功させる。
    await syncCommonUserHub(userId, verified.name ?? null, isNewUser).catch((error) => {
      console.error("共通顧客HUB同期に失敗しました", error);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof LineIdTokenVerificationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("LINEログイン処理に失敗しました", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
