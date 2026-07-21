import { createSupabaseServerClient } from "@/lib/supabase-server";
import { completePlotPurchase } from "@/lib/plot-reservations";
import { postLandSaleCommission } from "@/lib/castle-commissions";
import { notifyPlotPurchase } from "@/lib/castle-notifications";
import { confirmReferral } from "@/lib/common-user-hub";
import { adjustUserBalance } from "@/lib/atomic-balance";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

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
async function recordAgentSaleIfReferred(supabase: SupabaseServerClient, userId: string, itemType: string, amountYen: number) {
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
  });
  if (insertError) throw insertError;
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

// 千ノ国パスポート 全体統合対応 実装計画(PR2/PR3)。
// 「入金が確定した(status='processing')購入に対して、実際の権利付与を行うブロック」を
// Stripe Webhook(自動)と管理画面の手動再実行(PR3)の両方から共通で呼べるよう切り出したもの。
// 呼び出し前提: purchase.statusが既に'processing'であること(pending→processingの
// 原子的な遷移は呼び出し元の責務。二重実行防止のロックとして機能する)。
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
      await completePlotPurchase(purchase.id);
      await postLandSaleCommission(purchase.id);
      await notifyPlotPurchase(purchase.user_id, purchase.plot_id);
    } else if (purchase.grant_amount > 0) {
      // 付与量は購入時にpurchasesへ保存した値を正とする(後からパック設定が変わっても影響を受けない)。
      await grantPurchase(purchase.user_id, purchase.item_type, purchase.grant_amount);
      await recordAgentSaleIfReferred(supabase, purchase.user_id, purchase.item_type, purchase.amount);
    }

    await confirmReferralForPurchase(supabase, purchase.user_id, purchase.id, purchase.item_type, amountReceivedYen);

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
