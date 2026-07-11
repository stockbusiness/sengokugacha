import { NextRequest, NextResponse } from "next/server";
import { getProperties } from "@/lib/metaverse";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const areaId = request.nextUrl.searchParams.get("areaId") ?? undefined;
  const properties = await getProperties(areaId ? { areaId } : undefined);
  return NextResponse.json(properties);
}
