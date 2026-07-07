// LINEログインのIDトークンをLINEサーバー側で検証する。
// クライアントから送られてきた情報をそのまま信用しない(なりすまし防止)。
// 参考: https://developers.line.biz/ja/reference/line-login/#verify-id-token

import { getLineSettings } from "@/lib/line-settings";

type LineVerifyResponse = {
  iss: string;
  sub: string; // LINEユーザーID
  aud: string;
  exp: number;
  iat: number;
  name?: string;
  picture?: string;
};

export class LineIdTokenVerificationError extends Error {}

export async function verifyLineIdToken(idToken: string): Promise<LineVerifyResponse> {
  const settings = await getLineSettings();
  const channelId = settings?.channel_id;
  if (!channelId) {
    throw new Error("LINEチャネルIDが管理画面で設定されていません");
  }

  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("LINE IDトークン検証エラー", res.status, detail);
    throw new LineIdTokenVerificationError(
      `LINE IDトークンの検証に失敗しました (status: ${res.status})${detail ? `: ${detail}` : ""}`
    );
  }

  return (await res.json()) as LineVerifyResponse;
}
