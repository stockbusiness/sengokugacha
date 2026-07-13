import { NextResponse } from "next/server";
import { getPublishedCastles } from "@/lib/castles";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const castles = await getPublishedCastles();
  return NextResponse.json(castles);
}
