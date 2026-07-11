import { NextResponse } from "next/server";
import { getRecentlyViewedProperties } from "@/lib/metaverse";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const properties = await getRecentlyViewedProperties(session.userId);
  return NextResponse.json(properties);
}
