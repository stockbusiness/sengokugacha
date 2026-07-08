// LINE公式アカウントの友だち全員へテキストメッセージを一斉配信する(再エンゲージメント施策用)。
// 参考: https://developers.line.biz/ja/reference/messaging-api/#send-broadcast-message
export async function broadcastMessage(accessToken: string, text: string): Promise<void> {
  const res = await fetch("https://api.line.me/v2/bot/message/broadcast", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    throw new Error(`一斉配信に失敗しました: ${await res.text()}`);
  }
}
