import { createSupabaseServerClient } from "@/lib/supabase-server";
import { completePlotPurchase } from "@/lib/plot-reservations";
import { postLandSaleCommission } from "@/lib/castle-commissions";
import { notifyPlotPurchase } from "@/lib/castle-notifications";
import { confirmReferral } from "@/lib/common-user-hub";
import { adjustUserBalance } from "@/lib/atomic-balance";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

type GrantStepKey =
  | "balance_granted"
  | "plot_completed"
  | "commission_posted"
  | "agent_sale_recorded"
  | "referral_confirmed"
  | "notification_sent";

// 千ノ国パスポート次期改修指示書 P0-2(§4.1・4.2)。
// runPurchaseGrant()内の各副作用をステップ単位で冪等化する。既にcompletedのステップは
// スキップし、pending/failedのまま残っているステップのみ再実行する。これにより、
// 「残高付与は成功したが後続ステップで失敗した」購入を再試行しても、残高付与を
// 二重実行しない(P0-2で指摘されたバグ#1の修正)。
async function runStep(
  supabase: SupabaseServerClient,
  purchaseId: string,
  stepKey: GrantStepKey,
  fn: () => Promise<void>
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("purchase_grant_steps")
    .select("id, status, attempt_count")
    .eq("purchase_id", purchaseId)
    .eq("step_key", stepKey)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (existing?.status === "completed") return;

  let stepRowId: string;
  if (existing) {
    stepRowId = existing.id as string;
    const { error: updateError } = await supabase
      .from("purchase_grant_steps")
      .update({
        status: "pending",
        attempt_count: (existing.attempt_count ?? 0) + 1,
        started_at: new Date().toISOString(),
      })
      .eq("id", stepRowId);
    if (updateError) throw updateError;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("purchase_grant_steps")
      .insert({ purchase_id: purchaseId, step_key: stepKey, status: "pending", attempt_count: 1, started_at: new Date().toISOString() })
      .select("id")
      .single();
    if (insertError) {
      if (insertError.code !== "23505") throw insertError;
      // 並行実行との競合。相手が既にステップ行を作成済みのため取得し直す。
      const { data: raced, error: racedError } = await supabase
        .from("purchase_grant_steps")
        .select("id, status")
        .eq("purchase_id", purchaseId)
        .eq("step_key", stepKey)
        .single();
      if (racedError) throw racedError;
      if (raced.status === "completed") return;
      stepRowId = raced.id as string;
    } else {
      stepRowId = inserted.id as string;
    }
  }

  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await supabase.from("purchase_grant_steps").update({ status: "failed", last_error: message }).eq("id", stepRowId);
    throw error;
  }

  const { error: completeError } = await supabase
    .from("purchase_grant_steps")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", stepRowId);
  if (completeError) throw completeError;
}

async function grantPurchase(userId: string, itemType: string, grantAmount: number) {
  if (itemType === "kokudaka") {
    await adjustUserBalance(userId, "kokudaka", grantAmount);
  } else if (itemType === "gacha_ticket") {
    await adjustUserBalance(userId, "gacha_tickets", grantAmount);
  }
}

// 04_mvp_spec 3.3: 紹介経由ユーザーの購入イベントを agent_sales に記録する(Phase1は記録のみ)。
// agents テーブルにユーザーとの紐付け(user_id)が無いため、「代理店自身の自己購入」を
// システム的に判別する手段が現状無い。そのためPhase1では紹介経由の購入を一律
// type='referral' として記録する(自己購入分の仕分けはPhase2で人手/追加設計により対応)。
// P0-2(§6.3): agent_sales.purchase_idを保存し、同一購入での二重記録を部分unique indexで防ぐ。
async function recordAgentSaleIfReferred(
  supabase: SupabaseServerClient,
  purchaseId: string,
  userId: string,
  itemType: string,
  amountYen: number
) {
  const { data: user, error } = await supabase
    .from("users")
    .select("referring_agent_id")
    .eq("id", userId)
    .single();
  if (error) throw error;
  if (!user.referring_agent_id) return;

  const { error: insertError } = await supabase.from("agent_sales").insert({
    agent_id: user.referring_agent_id,
    buyer_user_id: userId,
    amount: amountYen,
    type: "referral",
    source: itemType,
    purchase_id: purchaseId,
  });
  if (insertError) {
    if (insertError.code === "23505") return; // 同一購入分は記録済み(冪等)。
    throw insertError;
  }
}

// sengoku-ai.com EXTERNAL_DEVELOPER_GUIDE 10.2章。referral_session_keyが
// 保存されているユーザー(=紹介URL経由で登録したユーザー)の購入完了を通知する。
// ベストエフォート(confirmReferral自体がfail-open)なので、失敗しても購入処理は継続する。
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

  await confirmReferral({
    referralSessionKey: user.referral_session_key,
    externalUserId: userId,
    referralSource: "purchase",
    metadata: { purchase_id: purchaseId, item_type: itemType, amount: amountYen },
  });
}

// 千ノ国パスポート 全体統合対応 実装計画(PR2/PR3)。P0-2(§4.1)でステップ単位の冪等化を追加。
// 「入金が確定した(status='processing')購入に対して、実際の権利付与を行うブロック」を
// Stripe Webhook(自動)と管理画面の手動再実行(PR3)の両方から共通で呼べるよう切り出したもの。
// 呼び出し前提: purchase.statusが既に'processing'であること(pending→processingの
// 原子的な遷移は呼び出し元の責務。二重実行防止のロックとして機能する)。
// 各副作用はrunStep()でステップ単位に冪等化されているため、この関数自体が何度再実行されても
// 既に成功したステップ(残高付与等)を再実行しない。
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
      // 土地区画の購入(城主プラン)。既存のkokudaka/gacha_ticket用grantPurchase()は変更しない。
      await runStep(supabase, purchase.id, "plot_completed", () => completePlotPurchase(purchase.id));
      await runStep(supabase, purchase.id, "commission_posted", () => postLandSaleCommission(purchase.id));
      await runStep(supabase, purchase.id, "notification_sent", () => notifyPlotPurchase(purchase.user_id, purchase.plot_id));
    } else if (purchase.grant_amount > 0) {
      // 付与量は購入時にpurchasesへ保存した値を正とする(後からパック設定が変わっても影響を受けない)。
      await runStep(supabase, purchase.id, "balance_granted", () =>
        grantPurchase(purchase.user_id, purchase.item_type, purchase.grant_amount)
      );
      await runStep(supabase, purchase.id, "agent_sale_recorded", () =>
        recordAgentSaleIfReferred(supabase, purchase.id, purchase.user_id, purchase.item_type, purchase.amount)
      );
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
