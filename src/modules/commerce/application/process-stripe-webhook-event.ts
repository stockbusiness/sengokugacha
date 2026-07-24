import type Stripe from "stripe";
import { runPurchaseGrant } from "@/lib/purchase-grants";
import type { PurchaseRepository, StripeInboxRepository } from "@/modules/commerce/application/ports";

// 千ノ国パスポート 全体統合対応 実装計画(PR2)。
// purchase.statusを先にcompletedへ確定してから区画・残高・報酬を処理する旧フローは、
// 途中失敗時にWebhook再送で復旧できない問題があった。新フローはpending→processingへの
// 原子的な遷移(guard-clause update)を「権利付与ブロックを1回だけ実行する」ためのロック
// として使い、実際に全ステップが成功した場合のみstatus='completed'へ進める(実際の権利
// 付与処理はrunPurchaseGrant()に切り出し、管理画面からの手動再実行と共通化している)。
async function handleCheckoutSessionCompleted(
  purchaseRepository: PurchaseRepository,
  checkoutSession: Stripe.Checkout.Session
): Promise<void> {
  const purchase = await purchaseRepository.findByStripeSessionId(checkoutSession.id);
  if (!purchase) return; // 対応する注文行が見つからない(想定外)。再送されても状況は変わらない。

  const paymentIntentId = typeof checkoutSession.payment_intent === "string" ? checkoutSession.payment_intent : null;
  const amountReceivedYen = checkoutSession.amount_total ?? undefined;

  // pending→processingへの遷移に成功した呼び出しだけが権利付与ブロックへ進む。
  // 既にprocessing/completed/failed/refundedの場合は「処理中または処理済み」とみなし、
  // 二重付与を避けるためここで終える(processingで止まっている行の復旧は管理画面から行う)。
  const claimed = await purchaseRepository.claimForProcessing(purchase.id, paymentIntentId, amountReceivedYen);
  if (!claimed) return;

  try {
    await runPurchaseGrant(purchase.id);
  } catch (error) {
    // grant_statusはrunPurchaseGrant内で既に記録済み。Stripe側への自動再送には頼らず、
    // 管理画面からの手動再実行で復旧する想定のため、ここで例外を再送出しない
    // (Webhook自体は正常受信として扱う)。
    console.error(`購入(${purchase.id})の権利付与処理に失敗しました`, error);
  }
}

export type ProcessStripeWebhookEventResult = { outcome: "duplicate" | "in_progress" | "dead" | "processed" | "failed" };

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-3(§6)。
// claim_stripe_webhook_event()(Postgres関数)が「行が無ければ作成→SELECT ... FOR UPDATE→
// 状態遷移判定→claim」を単一トランザクションで行うため、同一Stripe eventの並行到達でも
// 二重にprocessingへ進むことはなく、unique制約違反が呼び出し元まで伝播することもない。
export async function processStripeWebhookEvent(
  stripeInboxRepository: StripeInboxRepository,
  purchaseRepository: PurchaseRepository,
  event: Stripe.Event,
  claimToken: string
): Promise<ProcessStripeWebhookEventResult> {
  const claimResult = await stripeInboxRepository.claimEvent(
    event.id,
    event.type,
    event as unknown as Record<string, unknown>,
    claimToken
  );

  if (claimResult.claim_outcome === "duplicate") {
    return { outcome: "duplicate" }; // 処理済みイベントの再送(冪等)。
  }
  if (claimResult.claim_outcome === "in_progress") {
    return { outcome: "in_progress" }; // 他のリクエストが処理中(併走を許さず、待たせもしない)。
  }
  if (claimResult.claim_outcome === "dead") {
    // 再試行の上限に達している。Stripe側の再送に頼らず管理画面からの手動再実行に委ねるため、
    // 200を返してStripeからの再送を止める(呼び出し元route.tsで対応)。
    console.error(`Stripe webhookイベント(${event.id})は再試行の上限に達しています`);
    return { outcome: "dead" };
  }

  const inboxEventId = claimResult.inbox_event_id;

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutSessionCompleted(purchaseRepository, event.data.object as Stripe.Checkout.Session);
    }

    const succeeded = await stripeInboxRepository.markSucceeded(inboxEventId, claimToken);
    if (!succeeded) {
      console.error(`Stripe webhookイベント(${event.id})の完了記録がclaim_token不一致で失敗しました(横取りされた可能性)`);
    }
    return { outcome: "processed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    try {
      await stripeInboxRepository.markFailed(inboxEventId, claimToken, message);
    } catch (failedError) {
      console.error("Stripe webhook失敗記録の更新に失敗しました", failedError);
    }
    console.error("Stripe webhook処理に失敗しました", error);
    return { outcome: "failed" };
  }
}
