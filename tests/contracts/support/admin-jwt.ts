import { SignJWT } from "jose";
import { TEST_SESSION_SECRET } from "./server";

// 千ノ国パスポート Phase C-0(§14 API Contractテスト)。
// src/shared/auth/index.tsのsignSessionJwt()と同じ形状(HS256、role/adminRoleクレーム)の
// トークンを、テストプロセス側で直接組み立てる(ログインAPIを経由しない)。

export async function signAdminSessionToken(adminRole: "operator" | "manager"): Promise<string> {
  const secret = new TextEncoder().encode(TEST_SESSION_SECRET);
  return new SignJWT({ role: "admin", actorName: "contract-test", adminRole })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("3600s")
    .sign(secret);
}

export function adminCookieHeader(token: string): string {
  return `sengoku_admin_session=${token}`;
}
