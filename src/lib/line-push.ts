// LINE公式アカウントから特定の1ユーザーへテキストメッセージを送信する(個別イベント通知用)。
// 参考: https://developers.line.biz/ja/reference/messaging-api/#send-push-message
//
// 千ノ国パスポート PR #147マージ前最終修正指示§4。referral.confirmed等の
// entitlement/reward系送信とは異なり、この関数はidempotency keyを持たない
// (LINE Messaging APIのpush送信はリトライキー機構が無い)。notification_outbox_events
// 経由の再送(手動drain含む)は「at-least-once、重複時は同一文面の通知がもう一度届く
// 可能性がある(ベストエフォート)」仕様として扱う。残高・権利・報酬には一切影響しない
// 通知専用の経路であるため、この既定方針で問題ないと判断している。
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
