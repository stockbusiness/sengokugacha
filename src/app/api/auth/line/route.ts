import { NextRequest, NextResponse } from "next/server";
import { LineIdTokenVerificationError, verifyLineIdToken } from "@/lib/line";
import { findOrCreateUserByLineId, recordLoginToday } from "@/lib/passport";
import { setSessionCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const idToken = body?.idToken;
  const refCode = typeof body?.refCode === "string" && body.refCode.length > 0 ? body.refCode : null;

  if (typeof idToken !== "string" || idToken.length === 0) {
    return NextResponse.json({ error: "idToken is required" }, { status: 400 });
  }

  try {
    const verified = await verifyLineIdToken(idToken);
    const userId = await findOrCreateUserByLineId(verified.sub, verified.name ?? null, refCode);
    await recordLoginToday(userId);
    await setSessionCookie({ userId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof LineIdTokenVerificationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("LINEログイン処理に失敗しました", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
