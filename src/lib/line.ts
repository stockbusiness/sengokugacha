// LINEログインのIDトークンをLINEサーバー側で検証する。
// クライアントから送られてきた情報をそのまま信用しない(なりすまし防止)。
// 参考: https://developers.line.biz/ja/reference/line-login/#verify-id-token

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
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) {
    throw new Error("LINE_LOGIN_CHANNEL_ID が未設定です");
  }

  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });

  if (!res.ok) {
    throw new LineIdTokenVerificationError(
      `LINE IDトークンの検証に失敗しました (status: ${res.status})`
    );
  }

  return (await res.json()) as LineVerifyResponse;
}
