import { createHash } from "node:crypto";
import { logAdminAction } from "@/lib/admin-audit-log";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  SALES_FACT_SOURCE_SYSTEM_KEY,
  buildSalesFactCorrelationId,
  buildSalesFactEventId,
  buildSalesFactPayload,
  canonicalizeSalesFactPayload,
  isValidAmountMinor,
  resolveCommonUserResolutionStatus,
  type SalesFactPayload,
} from "@/modules/castle/domain/sales-fact-event";
import { shouldRecordSalesFact } from "@/modules/castle/domain/sales-fact-outbox-policy";
import { getSalesFactOutboxSettings } from "@/lib/sales-fact-outbox-settings";

// Passport実装指示書 PR-P1c「販売成果Outbox」。
//
// PR-P1aで報酬計上を止めたため、Agencyが稼働するまでの間、販売が起きても記録が
// どこにも残らない。その穴を埋める。記録するのは販売の事実だけで、報酬金額も
// 報酬可否も確定しない。
//
// 配送は本PRでは実装しない。Agencyの受信契約が確定してから別PRで足す。

// 同じevent_idで異なるpayloadが届いた場合の記録。運用ヘルスで検知できるよう、
// action名を固定する。
export const SALES_FACT_PAYLOAD_MISMATCH_ACTION = "sales_fact_payload_mismatch";

function hashPayload(payload: SalesFactPayload): string {
  return createHash("sha256").update(canonicalizeSalesFactPayload(payload)).digest("hex");
}

// Stripe決済確定後、runPurchaseGrant()のステップから呼ばれる。
//
// PR-P1aのpostLandSaleCommission()と同じく、ここは必ず「成功扱いのスキップ/完了」に
// する。例外を投げるとrunStep()がmarkStepFailed()を呼び、購入全体が失敗して決済済みの
// 利用者が商品を受け取れなくなる(実施順序書§4「同期API失敗で購入や返金を失敗させない」)。
export async function recordSalesFact(purchaseId: string): Promise<void> {
  const settings = await getSalesFactOutboxSettings();
  if (!shouldRecordSalesFact(settings)) return;

  const supabase = createSupabaseServerClient();

  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select("id, user_id, item_type, amount, amount_received_yen, plot_id, sales_agent_id, selling_agent_id, created_at")
    .eq("id", purchaseId)
    .maybeSingle();
  if (purchaseError) throw purchaseError;
  if (!purchase) return;

  // 販売時点の紹介・担当情報をここで読み、そのままスナップショットとして保存する。
  // 後からユーザーマスタ側が変わっても、既存行は更新しない。
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, common_user_id, referral_session_key, referring_agent_id, assigned_agent_id")
    .eq("id", purchase.user_id)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) return;

  const amountMinor = purchase.amount_received_yen ?? purchase.amount;
  if (!isValidAmountMinor(amountMinor)) {
    // 丸めて通すと金額がずれたまま気付けない。記録せず、気付けるように残す。
    await logAdminAction(null, "sales_fact_invalid_amount", `purchase_id=${purchaseId}`);
    return;
  }

  const commonUserId = (user.common_user_id as string | null) || null;

  const payload = buildSalesFactPayload({
    purchaseId: purchase.id,
    passportUserId: purchase.user_id,
    commonUserId,
    castlePlotId: (purchase.plot_id as string | null) ?? null,
    productType: purchase.item_type,
    // Q5(案b)により5システム共通の商品台帳は作らない。Passportが担当する商品の
    // 識別子(kokudaka / gacha_ticket / land_plot)をそのまま使う。
    productCode: purchase.item_type,
    amountMinor,
    currency: "JPY",
    // Passportには「入金確定時刻」の列が無いため、購入レコードの作成時刻を使う。
    occurredAt: purchase.created_at,
    attribution: {
      referralSessionKey: (user.referral_session_key as string | null) ?? null,
      registrationReferrerAgencyId: (user.referring_agent_id as string | null) ?? null,
      assignedAgencyId: (user.assigned_agent_id as string | null) ?? null,
      salesAgentId: (purchase.sales_agent_id as string | null) ?? null,
      closingAgentId: (purchase.selling_agent_id as string | null) ?? null,
    },
  });

  const payloadHash = hashPayload(payload);
  const eventId = buildSalesFactEventId(purchase.id);

  // Supabase JSはトランザクションを跨げないため、冪等性はunique制約で担保する。
  // ignoreDuplicatesにより、既存行があれば何も返らない(既存行を上書きしない)。
  const { data: inserted, error: insertError } = await supabase
    .from("sales_fact_outbox_events")
    .upsert(
      {
        event_id: eventId,
        source_system_key: SALES_FACT_SOURCE_SYSTEM_KEY,
        occurred_at: payload.occurred_at,
        common_user_id: commonUserId,
        passport_user_id: payload.passport_user_id,
        purchase_id: payload.purchase_id,
        castle_plot_id: payload.castle_plot_id,
        product_type: payload.product_type,
        product_code: payload.product_code,
        amount_minor: payload.amount_minor,
        currency: payload.currency,
        referral_session_key: payload.referral_session_key,
        registration_referrer_agency_id: payload.registration_referrer_agency_id,
        assigned_agency_id: payload.assigned_agency_id,
        sales_agent_id: payload.sales_agent_id,
        closing_agent_id: payload.closing_agent_id,
        eligibility_status: payload.eligibility_status,
        correlation_id: buildSalesFactCorrelationId(purchase.id),
        payload,
        payload_hash: payloadHash,
        common_user_resolution_status: resolveCommonUserResolutionStatus(commonUserId),
      },
      { onConflict: "source_system_key,event_id", ignoreDuplicates: true }
    )
    .select("id");
  if (insertError) throw insertError;

  if (inserted && inserted.length > 0) return;

  // 既存行があった＝同じ販売を再度処理した。正常な重複か、整合性異常かを見分ける。
  const { data: existing, error: existingError } = await supabase
    .from("sales_fact_outbox_events")
    .select("payload_hash")
    .eq("source_system_key", SALES_FACT_SOURCE_SYSTEM_KEY)
    .eq("event_id", eventId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) return;

  if (existing.payload_hash !== payloadHash) {
    // 同じevent_idなのに中身が違う。既存行は上書きせず、気付けるように記録だけ残す。
    // ここで例外を投げると購入処理ごと失敗するため、投げない(修正指示5)。
    await logAdminAction(
      null,
      SALES_FACT_PAYLOAD_MISMATCH_ACTION,
      `event_id=${eventId} stored=${existing.payload_hash} incoming=${payloadHash}`
    );
  }
}
