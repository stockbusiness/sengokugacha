import { cookies } from "next/headers";
import { signSessionJwt, verifySessionJwt } from "@/shared/auth";

export const ADMIN_SESSION_COOKIE_NAME = "sengoku_admin_session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12時間

// 城主プランの財務影響操作(契約の入金確定以降の遷移・報酬ルール公開・報酬確定支払・
// 土地関連の返金等)だけを「本部管理者」に限定するための軽量な2ロール制。個別アカウント
// 基盤は作らず、既存の共有パスワード方式を踏襲して2つ目の共有パスワードでロールを判定する。
export type AdminRole = "operator" | "manager";

export async function setAdminSessionCookie(actorName?: string | null, adminRole: AdminRole = "manager") {
  const token = await signSessionJwt(
    { role: "admin", actorName: actorName || null, adminRole },
    ADMIN_SESSION_MAX_AGE_SECONDS
  );

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

  const payload = await verifySessionJwt(token);
  return payload?.role === "admin";
}

// 監査ログに記録する担当者名(ログイン時に任意入力)。共有パスワード運用のため、
// 個々の管理者を厳密に認証する仕組みではなく、あくまで記録用の自己申告名。
export async function getAdminActorName(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionJwt(token);
  if (!payload) return null;
  return typeof payload.actorName === "string" ? payload.actorName : null;
}

export async function clearAdminSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
}

// 旧セッション(2ロール導入前に発行されたCookie)にはadminRoleクレームが無いため、
// その場合は互換のため「本部管理者」として扱う(以前は全員が同じ権限だったため)。
export async function getAdminRole(): Promise<AdminRole | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionJwt(token);
  if (!payload || payload.role !== "admin") return null;
  return payload.adminRole === "operator" ? "operator" : "manager";
}

export async function requireManagerRole(): Promise<boolean> {
  return (await getAdminRole()) === "manager";
}
