import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { AdminRole, setAdminSessionCookie } from "@/lib/admin-session";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: NextRequest) {
  const managerPassword = process.env.ADMIN_PASSWORD;
  if (!managerPassword) {
    return NextResponse.json({ error: "ADMIN_PASSWORD が未設定です" }, { status: 500 });
  }
  // 本部担当者用パスワード。未設定でも既存の運用(本部管理者パスワードのみ)を壊さない。
  const operatorPassword = process.env.ADMIN_PASSWORD_OPERATOR;

  const body = await request.json().catch(() => null);
  const password = body?.password;
  const actorName = typeof body?.actorName === "string" ? body.actorName.slice(0, 50) : null;

  let adminRole: AdminRole | null = null;
  if (typeof password === "string" && safeCompare(password, managerPassword)) {
    adminRole = "manager";
  } else if (typeof password === "string" && operatorPassword && safeCompare(password, operatorPassword)) {
    adminRole = "operator";
  }

  if (!adminRole) {
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  await setAdminSessionCookie(actorName, adminRole);
  return NextResponse.json({ ok: true, adminRole });
}
