import { describe, expect, it } from "vitest";
import {
  ELIGIBILITY_STATUSES,
  PASSPORT_ELIGIBILITY_STATUS,
  buildSalesFactCorrelationId,
  buildSalesFactEventId,
  buildSalesFactPayload,
  canonicalizeSalesFactPayload,
  isDeliverable,
  isValidAmountMinor,
  resolveCommonUserResolutionStatus,
  type SalesFactInput,
} from "./sales-fact-event";

const BASE: SalesFactInput = {
  purchaseId: "purchase-1",
  passportUserId: "user-1",
  commonUserId: "cu-1",
  castlePlotId: "plot-1",
  productType: "land_plot",
  productCode: "land_plot",
  amountMinor: 300_000,
  currency: "JPY",
  occurredAt: "2026-08-21T00:00:00.000Z",
  attribution: {
    referralSessionKey: "sess-1",
    registrationReferrerAgencyId: "agency-1",
    assignedAgencyId: "agency-2",
    salesAgentId: "agent-1",
    closingAgentId: "agent-2",
  },
};

describe("buildSalesFactEventId", () => {
  it("同じpurchase_idからは常に同じevent_idになる", () => {
    expect(buildSalesFactEventId("purchase-1")).toBe(buildSalesFactEventId("purchase-1"));
    expect(buildSalesFactEventId("purchase-1")).toBe("sales_fact:purchase-1");
  });

  it("purchase_idが違えばevent_idも違う", () => {
    expect(buildSalesFactEventId("purchase-1")).not.toBe(buildSalesFactEventId("purchase-2"));
  });
});

describe("buildSalesFactCorrelationId", () => {
  it("購入から決定的に導出する", () => {
    expect(buildSalesFactCorrelationId("purchase-1")).toBe("purchase:purchase-1");
  });
});

describe("buildSalesFactPayload", () => {
  it("同じ入力からは同じpayloadになる", () => {
    expect(buildSalesFactPayload(BASE)).toEqual(buildSalesFactPayload(BASE));
  });

  // Passportは報酬可否を確定しない(C1回答 修正指示2)。
  it("eligibility_statusは常にUNKNOWN", () => {
    expect(buildSalesFactPayload(BASE).eligibility_status).toBe("UNKNOWN");
    expect(PASSPORT_ELIGIBILITY_STATUS).toBe("UNKNOWN");
    // 高額でも紹介者付きでも、Passport側の判断は変わらない。
    const rich = buildSalesFactPayload({ ...BASE, amountMinor: 10_000_000 });
    expect(rich.eligibility_status).toBe("UNKNOWN");
  });

  it("取りうる状態は3つだけ", () => {
    expect(ELIGIBILITY_STATUSES).toEqual(["UNKNOWN", "POTENTIALLY_ELIGIBLE", "NOT_ELIGIBLE"]);
  });

  it("common_user_idがnullでもpayloadを作れる", () => {
    const payload = buildSalesFactPayload({ ...BASE, commonUserId: null });
    expect(payload.common_user_id).toBeNull();
    // 誰の販売かを失わないよう、Passport側のIDは必ず入る(C7)。
    expect(payload.passport_user_id).toBe("user-1");
  });

  it("紹介・担当情報を入力どおりに写す(スナップショット)", () => {
    const payload = buildSalesFactPayload(BASE);
    expect(payload.referral_session_key).toBe("sess-1");
    expect(payload.registration_referrer_agency_id).toBe("agency-1");
    expect(payload.assigned_agency_id).toBe("agency-2");
    expect(payload.sales_agent_id).toBe("agent-1");
    expect(payload.closing_agent_id).toBe("agent-2");
  });

  it("金額は整数のまま、通貨と対で持つ", () => {
    const payload = buildSalesFactPayload(BASE);
    expect(payload.amount_minor).toBe(300_000);
    expect(Number.isInteger(payload.amount_minor)).toBe(true);
    expect(payload.currency).toBe("JPY");
  });

  // 報酬金額はPassportで扱わない(C1回答 修正指示4)。
  it("報酬に関する項目を含まない", () => {
    const keys = Object.keys(buildSalesFactPayload(BASE));
    for (const forbidden of ["reward", "commission", "rate", "amount_yen", "reward_eligible"]) {
      expect(keys.some((key) => key.includes(forbidden)), `${forbidden} を含んではいけない`).toBe(false);
    }
  });

  // PIIを載せない(C1回答 修正指示7)。
  it("氏名・メール・住所・電話・カード情報を含まない", () => {
    const serialized = JSON.stringify(buildSalesFactPayload(BASE)).toLowerCase();
    for (const forbidden of ["name", "email", "mail", "address", "phone", "tel", "card", "birth"]) {
      expect(serialized.includes(forbidden), `${forbidden} を含んではいけない`).toBe(false);
    }
  });
});

describe("canonicalizeSalesFactPayload", () => {
  // キー順が違うだけでハッシュが変わると「整合性異常」を誤検知する。
  it("キーの並び順が違っても同じ文字列になる", () => {
    const payload = buildSalesFactPayload(BASE);
    const shuffled = Object.fromEntries(Object.entries(payload).reverse()) as typeof payload;
    expect(canonicalizeSalesFactPayload(shuffled)).toBe(canonicalizeSalesFactPayload(payload));
  });

  it("中身が違えば文字列も違う", () => {
    const a = canonicalizeSalesFactPayload(buildSalesFactPayload(BASE));
    const b = canonicalizeSalesFactPayload(buildSalesFactPayload({ ...BASE, amountMinor: 1 }));
    expect(a).not.toBe(b);
  });
});

describe("isValidAmountMinor", () => {
  it("非負の整数だけを受け入れる", () => {
    expect(isValidAmountMinor(0)).toBe(true);
    expect(isValidAmountMinor(300_000)).toBe(true);
  });

  // 丸めて通すと金額がずれたまま気付けない。弾く。
  it("小数・負数・非有限値を弾く", () => {
    expect(isValidAmountMinor(1.5)).toBe(false);
    expect(isValidAmountMinor(-1)).toBe(false);
    expect(isValidAmountMinor(Number.NaN)).toBe(false);
    expect(isValidAmountMinor(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidAmountMinor(Number.MAX_SAFE_INTEGER + 2)).toBe(false);
  });
});

describe("isDeliverable", () => {
  // 未解決の行はAgencyへ配送しない(C1回答 修正指示3)。
  it("common_user_id未解決の行は配送対象にしない", () => {
    expect(isDeliverable({ deliveryStatus: "pending", commonUserResolutionStatus: "UNRESOLVED" })).toBe(false);
    expect(isDeliverable({ deliveryStatus: "pending", commonUserResolutionStatus: "FAILED" })).toBe(false);
  });

  it("解決済みかつ未配送のときだけ配送対象になる", () => {
    expect(isDeliverable({ deliveryStatus: "pending", commonUserResolutionStatus: "RESOLVED" })).toBe(true);
  });

  it("配送済み・配送中・失敗・deadは対象にしない", () => {
    for (const deliveryStatus of ["delivering", "delivered", "failed", "dead"] as const) {
      expect(isDeliverable({ deliveryStatus, commonUserResolutionStatus: "RESOLVED" })).toBe(false);
    }
  });
});

describe("resolveCommonUserResolutionStatus", () => {
  it("common_user_idの有無から状態を決める", () => {
    expect(resolveCommonUserResolutionStatus("cu-1")).toBe("RESOLVED");
    expect(resolveCommonUserResolutionStatus(null)).toBe("UNRESOLVED");
    expect(resolveCommonUserResolutionStatus("")).toBe("UNRESOLVED");
  });
});
