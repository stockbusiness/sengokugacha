import { NextResponse } from "next/server";
import { getJourneyProgressDetail } from "@/lib/learning-journey";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const detail = await getJourneyProgressDetail(session.userId);
  return NextResponse.json(detail);
}
