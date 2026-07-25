import Stripe from "stripe";

// 千ノ国パスポート Phase C-0 PR4(§5.3 Stripe Webhook purchase連携)。
// stripe.webhooks.generateTestHeaderString()は実際のStripeへのネットワークアクセスを
// 必要とせず、webhook secretから直接署名を計算するテスト専用ヘルパー(Stripe SDK公式提供)。
// これを使い、POST /api/stripe/webhookへ実際に検証を通過するリクエストを送信できる。

export function buildCheckoutSessionCompletedPayload(params: {
  eventId?: string;
  sessionId: string;
  paymentIntentId?: string;
  amountTotal?: number;
}): Record<string, unknown> {
  return {
    id: params.eventId ?? `evt_test_${crypto.randomUUID()}`,
    object: "event",
    type: "checkout.session.completed",
    api_version: "2026-06-24.dahlia",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: params.sessionId,
        object: "checkout.session",
        payment_intent: params.paymentIntentId ?? `pi_test_${crypto.randomUUID()}`,
        amount_total: params.amountTotal ?? 1000,
      },
    },
  };
}

export function signStripePayload(payload: Record<string, unknown>, secret: string): { rawBody: string; signature: string } {
  const rawBody = JSON.stringify(payload);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret });
  return { rawBody, signature };
}
