import { NextResponse } from "next/server";
import { getPassportData } from "@/lib/passport";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const passport = await getPassportData(session.userId);
  if (!passport) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(passport);
}
