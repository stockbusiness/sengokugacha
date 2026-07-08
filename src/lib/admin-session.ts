import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE_NAME = "sengoku_admin_session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12時間

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET が未設定です");
  }
  return new TextEncoder().encode(secret);
}

export async function setAdminSessionCookie(actorName?: string | null) {
  const token = await new SignJWT({ role: "admin", actorName: actorName || null })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
}

export async function getAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload.role === "admin";
  } catch {
    return false;
  }
}

// 監査ログに記録する担当者名(ログイン時に任意入力)。共有パスワード運用のため、
// 個々の管理者を厳密に認証する仕組みではなく、あくまで記録用の自己申告名。
export async function getAdminActorName(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return typeof payload.actorName === "string" ? payload.actorName : null;
  } catch {
    return null;
  }
}

export async function clearAdminSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
}
