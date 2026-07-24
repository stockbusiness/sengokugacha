import { createSupabaseServerClient } from "@/lib/supabase-server";
import { completePlotPurchase } from "@/lib/plot-reservations";
import { postLandSaleCommission } from "@/lib/castle-commissions";
import { notifyPlotPurchase } from "@/lib/castle-notifications";
import { confirmReferral } from "@/lib/common-user-hub";
import { enqueueOutboxEvent, markOutboxFailed, markOutboxSent } from "@/lib/integration-outbox";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

type GrantStepKey =
  | "balance_granted"
  | "plot_completed"
  | "commission_posted"
  | "agent_sale_recorded"
  | "referral_confirmed"
  | "notification_sent";

type ClaimPurchaseGrantStepResult = {
  claim_outcome: "claimed" | "already_completed" | "in_progress" | "dead";
  step_row_id: string;
  claim_token: string | null;
};

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-1(§4.3.1)。
// 旧実装は「pending更新→副作用実行→completed更新」の3手順が原子的でなく、副作用成功後
// completed更新前にプロセスが落ちると次回再実行時に同じ副作用が再実行されてしまうバグが
// あった。claim_purchase_grant_step()(Postgres関数、マイグレーション20260808000001)で
// 原子的にclaimし、claim_token(fencing token)をmark_purchase_grant_step_completed()/
// mark_purchase_grant_step_failed()へ渡すことで、lease切れ後に別のリクエストへ再claimされた
// 古いworkerが誤って完了・失敗の更新を行えないようにする。
async function runStep(
  supabase: SupabaseServerClient,
  purchaseId: string,
  stepKey: GrantStepKey,
  fn: () => Promise<void>
): Promise<void> {
  const { data: claimData, error: claimError } = await supabase
    .rpc("claim_purchase_grant_step", { p_purchase_id: purchaseId, p_step_key: stepKey })
    .single();
  if (claimError) throw claimError;
  const claim = claimData as ClaimPurchaseGrantStepResult;

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
    await supabase.rpc("mark_purchase_grant_step_failed", {
      p_step_row_id: claim.step_row_id,
      p_claim_token: claim.claim_token,
      p_error: message,
    });
    throw error;
  }

  const { data: completed, error: completeError } = await supabase.rpc("mark_purchase_grant_step_completed", {
    p_step_row_id: claim.step_row_id,
    p_claim_token: claim.claim_token,
  });
  if (completeError) throw completeError;
  if (!completed) {
    // claim_tokenが一致しなかった(=lease切れ後に別のリクエストへ再claimされていた)。
    // 副作用自体は実行済みだが、このリクエストの完了記録は権威を持たないため、
    // 呼び出し元には失敗として扱わせる(別workerの結果を信頼する)。
    throw new Error(`ステップ${stepKey}のcompleted更新が別のリクエストに横取りされました(purchase_id=${purchaseId})`);
  }
}

type BalanceGrantOutcome = { claim_outcome: "claimed" | "already_completed" | "in_progress" | "dead"; new_balance: number | null };
type AgentSaleOutcome = { claim_outcome: "claimed" | "already_completed" | "in_progress" | "dead" };

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-1(§4.3.2)。
// runStep()によるclaim/completed更新の分離では、副作用成功直後・completed更新前に
// プロセスが落ちる残存リスクを解消できない。apply_purchase_balance_grant()
// (Postgres関数、マイグレーション20260808000002)はclaim検証・残高加算・ステップ完了記録を
// 単一トランザクションとして実行するため、途中でプロセスが落ちてもトランザクション全体が
// ロールバックされ、二重付与も部分適用も起こらない(true all-or-nothing)。
async function applyBalanceGrantStep(
  supabase: SupabaseServerClient,
  purchaseId: string,
  userId: string,
  itemType: string,
  grantAmount: number
): Promise<void> {
  const column = itemType === "kokudaka" ? "kokudaka" : itemType === "gacha_ticket" ? "gacha_tickets" : null;
  if (!column) return; // 対象外のitem_typeは残高操作なし(旧grantPurchase()と同じ挙動)。

  const { data, error } = await supabase
    .rpc("apply_purchase_balance_grant", {
      p_purchase_id: purchaseId,
      p_user_id: userId,
      p_column: column,
      p_delta: grantAmount,
    })
    .single();
  if (error) throw error;
  const result = data as BalanceGrantOutcome;

  if (result.claim_outcome === "dead") {
    throw new Error(`ステップbalance_grantedは再試行の上限に達しています(purchase_id=${purchaseId})`);
  }
  if (result.claim_outcome === "in_progress") {
    throw new Error(`ステップbalance_grantedは他のリクエストが処理中です(purchase_id=${purchaseId})`);
  }
  // "claimed"(今回付与した)・"already_completed"(既に付与済み)はどちらも成功として扱う。
}

// 04_mvp_spec 3.3: 紹介経由ユーザーの購入イベントを agent_sales に記録する(Phase1は記録のみ)。
// agents テーブルにユーザーとの紐付け(user_id)が無いため、「代理店自身の自己購入」を
// システム的に判別する手段が現状無い。そのためPhase1では紹介経由の購入を一律
// type='referral' として記録する(自己購入分の仕分けはPhase2で人手/追加設計により対応)。
// record_purchase_agent_sale()(Postgres関数、マイグレーション20260808000002)がclaim検証・
// agent_sales記録・ステップ完了記録を単一トランザクションとして実行する(§4.3.2)。
async function recordAgentSaleStep(
  supabase: SupabaseServerClient,
  purchaseId: string,
  userId: string,
  itemType: string,
  amountYen: number
): Promise<void> {
  const { data, error } = await supabase
    .rpc("record_purchase_agent_sale", {
      p_purchase_id: purchaseId,
      p_user_id: userId,
      p_item_type: itemType,
      p_amount: amountYen,
    })
    .single();
  if (error) throw error;
  const result = data as AgentSaleOutcome;

  if (result.claim_outcome === "dead") {
    throw new Error(`ステップagent_sale_recordedは再試行の上限に達しています(purchase_id=${purchaseId})`);
  }
  if (result.claim_outcome === "in_progress") {
    throw new Error(`ステップagent_sale_recordedは他のリクエストが処理中です(purchase_id=${purchaseId})`);
  }
}

// sengoku-ai.com EXTERNAL_DEVELOPER_GUIDE 10.2章。referral_session_keyが
// 保存されているユーザー(=紹介URL経由で登録したユーザー)の購入完了を通知する。
// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-1(§4.3.3)。
// 送信前にintegration_outbox_eventsへ登録し、送信結果(成功/失敗)を記録する。
// 旧実装はconfirmReferral()自体がfail-open(例外を投げない)なため、purchase_grant_steps上は
// 常に「completed」扱いになり、実際の送信失敗が記録に残らなかった。outbox化により
// 失敗を検知・追跡し、管理画面から再送できるようにする(この関数自体は引き続き
// ベストエフォートとして扱い、送信失敗時も購入処理を継続させる)。
async function confirmReferralForPurchase(
  supabase: SupabaseServerClient,
  userId: string,
  purchaseId: string,
  itemType: string,
  amountYen: number
) {
  const { data: user, error } = await supabase
    .from("users")
    .select("referral_session_key")
    .eq("id", userId)
    .maybeSingle();
  if (error || !user?.referral_session_key) return;

  const input = {
    referralSessionKey: user.referral_session_key,
    externalUserId: userId,
    referralSource: "purchase" as const,
    metadata: { purchase_id: purchaseId, item_type: itemType, amount: amountYen },
  };
  const outboxId = await enqueueOutboxEvent(
    supabase,
    "integration_outbox_events",
    "purchase",
    purchaseId,
    "referral.confirmed",
    "sengoku-ai",
    input
  );

  const sent = await confirmReferral(input);
  if (sent) {
    await markOutboxSent(supabase, "integration_outbox_events", outboxId);
  } else {
    await markOutboxFailed(supabase, "integration_outbox_events", outboxId, "confirmReferralが失敗を返しました", 0);
  }
}

// 区画購入確定のLINE通知。モジュール化後バグ修正・Phase B改修指示書 Phase A-1(§4.3.3)。
// 送信前にnotification_outbox_eventsへ登録し、送信結果を記録する(referral_confirmedと
// 同じ設計、対象がLINE通知であるためintegration_outbox_eventsとは別テーブル)。
async function notifyPlotPurchaseViaOutbox(
  supabase: SupabaseServerClient,
  purchaseId: string,
  userId: string,
  plotId: string | null
): Promise<void> {
  if (!plotId) return;

  const outboxId = await enqueueOutboxEvent(
    supabase,
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
      await markOutboxSent(supabase, "notification_outbox_events", outboxId);
    } else {
      // LINE未連携・LINE設定未登録等、送信不要な対象外ケース(既存挙動と同じ「何もしない」)。
      // 再送しても意味が無いため送信済み扱いにする。
      await markOutboxSent(supabase, "notification_outbox_events", outboxId);
    }
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : "unknown error";
    await markOutboxFailed(supabase, "notification_outbox_events", outboxId, message, 0);
  }
}

// 千ノ国パスポート 全体統合対応 実装計画(PR2/PR3)。P0-2(§4.1)でステップ単位の冪等化を追加。
// 「入金が確定した(status='processing')購入に対して、実際の権利付与を行うブロック」を
// Stripe Webhook(自動)と管理画面の手動再実行(PR3)の両方から共通で呼べるよう切り出したもの。
// 呼び出し前提: purchase.statusが既に'processing'であること(pending→processingの
// 原子的な遷移は呼び出し元の責務。二重実行防止のロックとして機能する)。
// 各副作用はステップ単位に冪等化されているため、この関数自体が何度再実行されても既に
// 成功したステップを再実行しない(balance_granted/agent_sale_recordedは§4.3.2により
// claim・副作用・完了記録が単一トランザクションのPostgres関数、それ以外はrunStep()による
// claim+アプリケーション側での完了記録)。
// 成功時はstatus='completed'・grant_status='granted'まで進める。失敗時はgrant_status='failed'
// を記録したうえで例外を投げ直す(呼び出し元が再送に頼るか・エラー表示するかを選べるようにする)。
export async function runPurchaseGrant(purchaseId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data: purchase, error } = await supabase
    .from("purchases")
    .select("id, user_id, item_type, amount, amount_received_yen, grant_amount, plot_id, grant_attempt_count")
    .eq("id", purchaseId)
    .single();
  if (error) throw error;

  const amountReceivedYen = purchase.amount_received_yen ?? purchase.amount;

  try {
    if (purchase.item_type === "land_plot") {
      // 土地区画の購入(城主プラン)。kokudaka/gacha_ticket用のapplyBalanceGrantStep()とは別経路。
      await runStep(supabase, purchase.id, "plot_completed", () => completePlotPurchase(purchase.id));
      await runStep(supabase, purchase.id, "commission_posted", () => postLandSaleCommission(purchase.id));
      await runStep(supabase, purchase.id, "notification_sent", () =>
        notifyPlotPurchaseViaOutbox(supabase, purchase.id, purchase.user_id, purchase.plot_id)
      );
    } else if (purchase.grant_amount > 0) {
      // 付与量は購入時にpurchasesへ保存した値を正とする(後からパック設定が変わっても影響を受けない)。
      await applyBalanceGrantStep(supabase, purchase.id, purchase.user_id, purchase.item_type, purchase.grant_amount);
      await recordAgentSaleStep(supabase, purchase.id, purchase.user_id, purchase.item_type, purchase.amount);
    }

    await runStep(supabase, purchase.id, "referral_confirmed", () =>
      confirmReferralForPurchase(supabase, purchase.user_id, purchase.id, purchase.item_type, amountReceivedYen)
    );

    const { error: completeError } = await supabase
      .from("purchases")
      .update({ status: "completed", grant_status: "granted", granted_at: new Date().toISOString() })
      .eq("id", purchase.id);
    if (completeError) throw completeError;
  } catch (grantError) {
    const message = grantError instanceof Error ? grantError.message : "unknown error";
    await supabase
      .from("purchases")
      .update({
        grant_status: "failed",
        grant_last_error: message,
        grant_attempt_count: (purchase.grant_attempt_count ?? 0) + 1,
      })
      .eq("id", purchase.id);
    throw grantError;
  }
}
