import { NextResponse } from "next/server";
import { getJourneyOverview } from "@/lib/learning-journey";
import { getSession } from "@/lib/session";

// 「はじまりの旅」トップ。機能フラグOFF・公開コース無しなら enabled: false を返し、
// 画面側は入口ごと出さない。
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const overview = await getJourneyOverview(session.userId);
  return NextResponse.json(overview);
}
