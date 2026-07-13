// LINE公式アカウントから特定の1ユーザーへテキストメッセージを送信する(個別イベント通知用)。
// 参考: https://developers.line.biz/ja/reference/messaging-api/#send-push-message
export async function pushMessage(accessToken: string, lineUserId: string, text: string): Promise<void> {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    throw new Error(`個別送信に失敗しました: ${await res.text()}`);
  }
}
