import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { setAdminSessionCookie } from "@/lib/admin-session";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json({ error: "ADMIN_PASSWORD が未設定です" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const password = body?.password;

  if (typeof password !== "string" || !safeCompare(password, adminPassword)) {
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  await setAdminSessionCookie();
  return NextResponse.json({ ok: true });
}
