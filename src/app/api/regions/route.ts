import { NextResponse } from "next/server";
import { getRegionProgress } from "@/lib/regions";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const regions = await getRegionProgress(session.userId);
  return NextResponse.json(regions);
}
