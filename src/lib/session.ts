import { cookies } from "next/headers";
import { signSessionJwt, verifySessionJwt } from "@/shared/auth";

const SESSION_COOKIE_NAME = "sengoku_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30日

export type SessionPayload = {
  userId: string;
};

export async function createSessionToken(payload: SessionPayload) {
  return signSessionJwt(payload, SESSION_MAX_AGE_SECONDS);
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionJwt(token);
  if (!payload || typeof payload.userId !== "string") return null;
  return { userId: payload.userId };
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
