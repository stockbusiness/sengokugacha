import { SignJWT, jwtVerify } from "jose";

// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 6(§8・§15、セッション基盤統一)。
// src/lib/session.ts・src/lib/admin-session.ts・src/lib/agent-session.tsで三重に重複していた
// SESSION_SECRET解決+jose(HS256)署名/検証ロジックをここへ集約する。
// Cookie名・有効期限・クレーム形状は各セッションファイル側の責務のまま変更しない
// (このモジュールはJWTの署名・検証のみを担い、Cookieの読み書きには関与しない)。

function getSessionSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET が未設定です");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionJwt(claims: Record<string, unknown>, maxAgeSeconds: number): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(getSessionSecretKey());
}

// 検証失敗(署名不正・期限切れ・SESSION_SECRET未設定等)はnullを返す。
// 個々のセッション種別ごとのクレーム検証(role等)は呼び出し側の責務とする。
export async function verifySessionJwt(token: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecretKey());
    return payload;
  } catch {
    return null;
  }
}
