// Passport実装指示書 PR-P1c「販売成果Outbox」(Q3回答 案b)。
//
// PR-P1aで報酬計上を止めたため、Agencyが稼働するまでの間、販売が起きても記録が
// どこにも残らない。ここで扱うのは「販売の事実」だけで、報酬金額も報酬可否も
// 確定しない。正式な報酬対象判定はAgency側を正とする。

// 報酬対象の可能性。Passportは確定しない(C1回答 修正指示2)。
//
// POTENTIALLY_ELIGIBLE と NOT_ELIGIBLE を出し分けるには「どういう販売なら対象に
// なりうるか」の基準が要る。それは報酬ルールそのものでAgencyの管轄なので、Passport側
// に基準を置くと、名前を変えただけで実質的に報酬可否を判定していることになる。
// 判定基準がAgencyから示されるまで、Passportは常にUNKNOWNを入れる。
export const ELIGIBILITY_STATUSES = ["UNKNOWN", "POTENTIALLY_ELIGIBLE", "NOT_ELIGIBLE"] as const;
export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number];

// Passportが判定に使える情報だけでは報酬可否を決められない、という事実を型で表す。
export const PASSPORT_ELIGIBILITY_STATUS: EligibilityStatus = "UNKNOWN";

export type CommonUserResolutionStatus = "UNRESOLVED" | "RESOLVED" | "FAILED";
export type SalesFactDeliveryStatus = "pending" | "delivering" | "delivered" | "failed" | "dead";

// 販売時点の紹介・担当情報。スナップショットとして保存し、後から上書きしない
// (C1回答 修正指示7)。
export type SalesAttributionSnapshot = {
  referralSessionKey: string | null;
  registrationReferrerAgencyId: string | null;
  assignedAgencyId: string | null;
  salesAgentId: string | null;
  closingAgentId: string | null;
};

export type SalesFactInput = {
  purchaseId: string;
  passportUserId: string;
  commonUserId: string | null;
  castlePlotId: string | null;
  productType: string;
  productCode: string | null;
  amountMinor: number;
  currency: string;
  occurredAt: string;
  attribution: SalesAttributionSnapshot;
};

// event_idは決定的に生成する(C1回答 修正指示5)。同じ購入からは常に同じ値になるため、
// 再実行・再送・並行実行のいずれでもOutboxは1件に収束する。
//
// 現状 land_plot / kokudaka / gacha_ticket はいずれも1購入=1販売事実なので purchase_id
// だけで一意に定まる。1購入から複数の販売事実が出る商品が現れた場合は
// `sales_fact:{purchase_id}:{明細ID}` へ拡張する。
export function buildSalesFactEventId(purchaseId: string): string {
  return `sales_fact:${purchaseId}`;
}

export function buildSalesFactCorrelationId(purchaseId: string): string {
  return `purchase:${purchaseId}`;
}

// 配送する本文。
//
// 氏名・メール・住所・電話・カード情報は入れない(C1回答 修正指示7)。保持するのは
// IDと金額と時刻だけで、人に紐づく情報はAgency側がIDから引く。
export type SalesFactPayload = {
  event_id: string;
  source_system_key: string;
  occurred_at: string;
  common_user_id: string | null;
  passport_user_id: string;
  purchase_id: string;
  castle_plot_id: string | null;
  product_type: string;
  product_code: string | null;
  amount_minor: number;
  currency: string;
  referral_session_key: string | null;
  registration_referrer_agency_id: string | null;
  assigned_agency_id: string | null;
  sales_agent_id: string | null;
  closing_agent_id: string | null;
  eligibility_status: EligibilityStatus;
  correlation_id: string;
};

export const SALES_FACT_SOURCE_SYSTEM_KEY = "passport";

export function buildSalesFactPayload(input: SalesFactInput): SalesFactPayload {
  return {
    event_id: buildSalesFactEventId(input.purchaseId),
    source_system_key: SALES_FACT_SOURCE_SYSTEM_KEY,
    occurred_at: input.occurredAt,
    common_user_id: input.commonUserId,
    passport_user_id: input.passportUserId,
    purchase_id: input.purchaseId,
    castle_plot_id: input.castlePlotId,
    product_type: input.productType,
    product_code: input.productCode,
    amount_minor: input.amountMinor,
    currency: input.currency,
    referral_session_key: input.attribution.referralSessionKey,
    registration_referrer_agency_id: input.attribution.registrationReferrerAgencyId,
    assigned_agency_id: input.attribution.assignedAgencyId,
    sales_agent_id: input.attribution.salesAgentId,
    closing_agent_id: input.attribution.closingAgentId,
    eligibility_status: PASSPORT_ELIGIBILITY_STATUS,
    correlation_id: buildSalesFactCorrelationId(input.purchaseId),
  };
}

// ハッシュ照合用の正規化。キー順を固定しないと、同じ内容でもハッシュが変わってしまい
// 「整合性異常」を誤検知する。ハッシュ計算そのものは呼び出し側(node:crypto)で行う。
export function canonicalizeSalesFactPayload(payload: SalesFactPayload): string {
  const entries = Object.entries(payload as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify(entries);
}

// 金額は整数の最小通貨単位で扱う(C1回答 修正指示4)。小数や非有限値が紛れ込んだら
// 記録せず弾く。丸めて通してしまうと、金額がずれたまま気付けない。
export function isValidAmountMinor(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount >= 0;
}

// 配送対象の判定。
//
// common_user_idが未解決の行はAgencyへ配送しない(C1回答 修正指示3)。解決後に同じ行を
// 補完して配送するため、行そのものは残したまま対象から外す。
export function isDeliverable(row: {
  deliveryStatus: SalesFactDeliveryStatus;
  commonUserResolutionStatus: CommonUserResolutionStatus;
}): boolean {
  return row.deliveryStatus === "pending" && row.commonUserResolutionStatus === "RESOLVED";
}

export function resolveCommonUserResolutionStatus(commonUserId: string | null): CommonUserResolutionStatus {
  return commonUserId ? "RESOLVED" : "UNRESOLVED";
}
