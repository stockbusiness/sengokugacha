import { NextResponse } from "next/server";
import { clearAdminSessionCookie } from "@/lib/admin-session";

export async function POST() {
  await clearAdminSessionCookie();
  return NextResponse.json({ ok: true });
}
