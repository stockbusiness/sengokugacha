import { NextResponse } from "next/server";
import { getActiveMap } from "@/lib/metaverse";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const map = await getActiveMap();
  return NextResponse.json(map);
}
