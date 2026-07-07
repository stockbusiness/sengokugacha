import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { completeTenkaToitsu, getTenkaToitsuStatus, WarlordNotOwnedError } from "@/lib/tenka-toitsu";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const status = await getTenkaToitsuStatus(session.userId);
  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const warlordId = body?.warlordId;
  if (typeof warlordId !== "string" || warlordId.length === 0) {
    return NextResponse.json({ error: "warlordId is required" }, { status: 400 });
  }

  try {
    await completeTenkaToitsu(session.userId, warlordId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof WarlordNotOwnedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("天下統一達成処理に失敗しました", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
