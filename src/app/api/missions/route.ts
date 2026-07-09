import { NextResponse } from "next/server";
import { getDailyMissionStatus } from "@/lib/daily-missions";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const missions = await getDailyMissionStatus(session.userId);
  return NextResponse.json({ missions });
}
