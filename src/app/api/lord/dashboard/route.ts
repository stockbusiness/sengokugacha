import { NextResponse } from "next/server";
import { getLordDashboardSummary } from "@/lib/castle-kpi";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await getLordDashboardSummary(session.userId);
  return NextResponse.json(summary);
}
