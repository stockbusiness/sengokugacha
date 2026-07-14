import { NextResponse } from "next/server";
import { getPublishedCastlesForUser } from "@/lib/castles";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const castles = await getPublishedCastlesForUser(session.userId);
  return NextResponse.json(castles);
}
