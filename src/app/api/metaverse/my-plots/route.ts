import { NextResponse } from "next/server";
import { getMyPlotRights } from "@/lib/metaverse";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const plots = await getMyPlotRights(session.userId);
  return NextResponse.json(plots);
}
