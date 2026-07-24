import { completePlotPurchase } from "@/lib/plot-reservations";
import { postLandSaleCommission } from "@/lib/castle-commissions";
import { notifyPlotPurchase } from "@/lib/castle-notifications";
import { confirmReferral } from "@/lib/common-user-hub";
import type {
  GrantStepKey,
  PurchaseGrantStepRepository,
  PurchaseOutboxGateway,
  PurchaseRepository,
  UserRepository,
} from "@/modules/commerce/application/ports";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-1(§4.3.1)。
// 旧実装は「pending更新→副作用実行→completed更新」の3手順が原子的でなく、副作用成功後
// completed更新前にプロセスが落ちると次回再実行時に同じ副作用が再実行されてしまうバグが
// あった。claim_purchase_grant_step()(Postgres関数)で原子的にclaimし、claim_token
// (fencing token)をmark_purchase_grant_step_completed()/mark_purchase_grant_step_failed()へ
// 渡すことで、lease切れ後に別のリクエストへ再claimされた古いworkerが誤って完了・失敗の
// 更新を行えないようにする。
async function runStep(
  stepRepository: PurchaseGrantStepRepository,
  purchaseId: string,
  stepKey: GrantStepKey,
  fn: () => Promise<void>
): Promise<void> {
  const claim = await stepRepository.claimStep(purchaseId, stepKey);

  if (claim.claim_outcome === "already_completed") return;
  if (claim.claim_outcome === "dead") {
    throw new Error(`ステップ${stepKey}は再試行の上限に達しています(purchase_id=${purchaseId})`);
  }
  if (claim.claim_outcome === "in_progress") {
    throw new Error(`ステップ${stepKey}は他のリクエストが処理中です(purchase_id=${purchaseId})`);
  }

  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await stepRepository.markStepFailed(claim.step_row_id, claim.claim_token, message);
    throw error;
  }

  const completed = await stepRepository.markStepCompleted(claim.step_row_id, claim.claim_token);
  if (!completed) {
    // claim_tokenが一致しなかった(=lease切れ後に別のリクエストへ再claimされていた)。
    // 副作用自体は実行済みだが、このリクエストの完了記録は権威を持たないため、
    // 呼び出し元には失敗として扱わせる(別workerの結果を信頼する)。
    throw new Error(`ステップ${stepKey}のcompleted更新が別のリクエストに横取りされました(purchase_id=${purchaseId})`);
  }
}

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-1(§4.3.2)。
// apply_purchase_balance_grant()(Postgres関数)はclaim検証・残高加算・ステップ完了記録を
// 単一トランザクションとして実行するため、途中でプロセスが落ちてもロールバックされ、
// 二重付与も部分適用も起こらない(true all-or-nothing)。
async function applyBalanceGrantStep(
  stepRepository: PurchaseGrantStepRepository,
  purchaseId: string,
  userId: string,
  itemType: string,
  grantAmount: number
): Promise<void> {
  const column = itemType === "kokudaka" ? "kokudaka" : itemType === "gacha_ticket" ? "gacha_tickets" : null;
  if (!column) return; // 対象外のitem_typeは残高操作なし(旧grantPurchase()と同じ挙動)。

  const result = await stepRepository.applyBalanceGrant(purchaseId, userId, column, grantAmount);

  if (result.claim_outcome === "dead") {
    throw new Error(`ステップbalance_grantedは再試行の上限に達しています(purchase_id=${purchaseId})`);
  }
  if (result.claim_outcome === "in_progress") {
    throw new Error(`ステップbalance_grantedは他のリクエストが処理中です(purchase_id=${purchaseId})`);
  }
  // "claimed"(今回付与した)・"already_completed"(既に付与済み)はどちらも成功として扱う。
}

// 04_mvp_spec 3.3: 紹介経由ユーザーの購入イベントを agent_sales に記録する(Phase1は記録のみ)。
// record_purchase_agent_sale()(Postgres関数)がclaim検証・agent_sales記録・ステップ完了
// 記録を単一トランザクションとして実行する(§4.3.2)。
async function recordAgentSaleStep(
  stepRepository: PurchaseGrantStepRepository,
  purchaseId: string,
  userId: string,
  itemType: string,
  amountYen: number
): Promise<void> {
  const result = await stepRepository.recordAgentSale(purchaseId, userId, itemType, amountYen);

  if (result.claim_outcome === "dead") {
    throw new Error(`ステップagent_sale_recordedは再試行の上限に達しています(purchase_id=${purchaseId})`);
  }
  if (result.claim_outcome === "in_progress") {
    throw new Error(`ステップagent_sale_recordedは他のリクエストが処理中です(purchase_id=${purchaseId})`);
  }
}

// sengoku-ai.com EXTERNAL_DEVELOPER_GUIDE 10.2章。referral_session_keyが
// 保存されているユーザー(=紹介URL経由で登録したユーザー)の購入完了を通知する。
// モジュール化後バグ修正・Phase B改修指示書 Phase A-1(§4.3.3)。送信前に
// integration_outbox_eventsへ登録し、送信結果(成功/失敗)を記録する(この関数自体は
// 引き続きベストエフォートとして扱い、送信失敗時も購入処理を継続させる)。
async function confirmReferralForPurchase(
  outboxGateway: PurchaseOutboxGateway,
  userId: string,
  purchaseId: string,
  itemType: string,
  amountYen: number,
  referralSessionKey: string | null
) {
  if (!referralSessionKey) return;

  const input = {
    referralSessionKey,
    externalUserId: userId,
    referralSource: "purchase" as const,
    metadata: { purchase_id: purchaseId, item_type: itemType, amount: amountYen },
  };
  const outboxId = await outboxGateway.enqueueEvent(
    "integration_outbox_events",
    "purchase",
    purchaseId,
    "referral.confirmed",
    "sengoku-ai",
    input
  );

  const sent = await confirmReferral(input);
  if (sent) {
    await outboxGateway.markSent("integration_outbox_events", outboxId);
  } else {
    await outboxGateway.markFailed("integration_outbox_events", outboxId, "confirmReferralが失敗を返しました", 0);
  }
}

// 区画購入確定のLINE通知。モジュール化後バグ修正・Phase B改修指示書 Phase A-1(§4.3.3)。
// 送信前にnotification_outbox_eventsへ登録し、送信結果を記録する(referral_confirmedと
// 同じ設計、対象がLINE通知であるためintegration_outbox_eventsとは別テーブル)。
async function notifyPlotPurchaseViaOutbox(
  outboxGateway: PurchaseOutboxGateway,
  purchaseId: string,
  userId: string,
  plotId: string | null
): Promise<void> {
  if (!plotId) return;

  const outboxId = await outboxGateway.enqueueEvent(
    "notification_outbox_events",
    "purchase",
    purchaseId,
    "notification.plot_purchased",
    "line",
    { user_id: userId, plot_id: plotId }
  );

  try {
    const sent = await notifyPlotPurchase(userId, plotId);
    if (sent) {
      await outboxGateway.markSent("notification_outbox_events", outboxId);
    } else {
      // LINE未連携・LINE設定未登録等、送信不要な対象外ケース(既存挙動と同じ「何もしない」)。
      // 再送しても意味が無いため送信済み扱いにする。
      await outboxGateway.markSent("notification_outbox_events", outboxId);
    }
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : "unknown error";
    await outboxGateway.markFailed("notification_outbox_events", outboxId, message, 0);
  }
}

// 千ノ国パスポート 全体統合対応 実装計画(PR2/PR3)。P0-2(§4.1)でステップ単位の冪等化を追加。
// 「入金が確定した(status='processing')購入に対して、実際の権利付与を行うブロック」を
// Stripe Webhook(自動)と管理画面の手動再実行の両方から共通で呼べるよう切り出したもの。
// 呼び出し前提: purchase.statusが既に'processing'であること(pending→processingの
// 原子的な遷移は呼び出し元の責務。二重実行防止のロックとして機能する)。
// 各副作用はステップ単位に冪等化されているため、この関数自体が何度再実行されても既に
// 成功したステップを再実行しない。成功時はstatus='completed'・grant_status='granted'まで
// 進める。失敗時はgrant_status='failed'を記録したうえで例外を投げ直す。
export async function runPurchaseGrant(
  purchaseRepository: PurchaseRepository,
  stepRepository: PurchaseGrantStepRepository,
  outboxGateway: PurchaseOutboxGateway,
  userRepository: UserRepository,
  purchaseId: string
): Promise<void> {
  const purchase = await purchaseRepository.findGrantContext(purchaseId);
  const amountReceivedYen = purchase.amount_received_yen ?? purchase.amount;

  try {
    if (purchase.item_type === "land_plot") {
      // 土地区画の購入(城主プラン)。kokudaka/gacha_ticket用のapplyBalanceGrantStep()とは別経路。
      await runStep(stepRepository, purchase.id, "plot_completed", () => completePlotPurchase(purchase.id));
      await runStep(stepRepository, purchase.id, "commission_posted", () => postLandSaleCommission(purchase.id));
      await runStep(stepRepository, purchase.id, "notification_sent", () =>
        notifyPlotPurchaseViaOutbox(outboxGateway, purchase.id, purchase.user_id, purchase.plot_id)
      );
    } else if (purchase.grant_amount > 0) {
      // 付与量は購入時にpurchasesへ保存した値を正とする(後からパック設定が変わっても影響を受けない)。
      await applyBalanceGrantStep(stepRepository, purchase.id, purchase.user_id, purchase.item_type, purchase.grant_amount);
      await recordAgentSaleStep(stepRepository, purchase.id, purchase.user_id, purchase.item_type, purchase.amount);
    }

    await runStep(stepRepository, purchase.id, "referral_confirmed", async () => {
      const referralSessionKey = await userRepository.findReferralSessionKey(purchase.user_id);
      await confirmReferralForPurchase(
        outboxGateway,
        purchase.user_id,
        purchase.id,
        purchase.item_type,
        amountReceivedYen,
        referralSessionKey
      );
    });

    await purchaseRepository.markCompleted(purchase.id);
  } catch (grantError) {
    const message = grantError instanceof Error ? grantError.message : "unknown error";
    await purchaseRepository.markGrantFailed(purchase.id, message, purchase.grant_attempt_count ?? 0);
    throw grantError;
  }
}
