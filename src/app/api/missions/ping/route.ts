import { NextRequest, NextResponse } from "next/server";
import { pingManualMission } from "@/lib/daily-missions";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const key = body?.key;
  if (typeof key !== "string" || !key) {
    return NextResponse.json({ error: "key は必須です" }, { status: 400 });
  }

  await pingManualMission(session.userId, key);
  return NextResponse.json({ ok: true });
}
