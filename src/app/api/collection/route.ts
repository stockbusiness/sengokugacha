import { NextResponse } from "next/server";
import { getCollection } from "@/lib/collection";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const collection = await getCollection(session.userId);
  return NextResponse.json(collection);
}
