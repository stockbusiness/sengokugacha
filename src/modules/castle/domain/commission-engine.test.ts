import { describe, expect, it } from "vitest";
import {
  computeLandSaleCommissionLines,
  computeRefundAdjustments,
  validateRuleSetRates,
  type CommissionRateSet,
  type ExistingLedgerLine,
  type RecipientType,
} from "./commission-engine";

// 要件書4.2の初期値案(城主20%/販売代理店15%/組織15%/地域活動5%/開発積立15%/本部30%)。
// 8.2の表(土地1区画30万円を単純配分した表示例)と完全一致する値を使う。
const RATE_SET: CommissionRateSet = {
  lord_rate: 0.2,
  agency_rate: 0.15,
  organization_rate: 0.15,
  regional_activity_rate: 0.05,
  development_fund_rate: 0.15,
  hq_rate: 0.3,
};

const BASE_AMOUNT = 300_000;

describe("computeLandSaleCommissionLines", () => {
  it("TC1: 城主本人が自分の担当城の区画を販売 -> 別明細3行(lord/agency/organization)", () => {
    const lines = computeLandSaleCommissionLines({
      baseAmountYen: BASE_AMOUNT,
      rateSet: RATE_SET,
      lordContract: { contractId: "contract-A", lordUserId: "user-lord-A", status: "active" },
      sellingAgent: { agentId: "agent-A", rank: "アドバイザー", parentAgentId: null },
      minRankForCommission: "アドバイザー",
      retroactivePayoutEnabled: false,
    });

    expect(lines).toHaveLength(3);
    expect(lines).toContainEqual({
      recipientType: "lord",
      recipientUserId: "user-lord-A",
      recipientAgentId: null,
      rate: 0.2,
      amountYen: 60_000,
    });
    expect(lines).toContainEqual({
      recipientType: "agency",
      recipientUserId: null,
      recipientAgentId: "agent-A",
      rate: 0.15,
      amountYen: 45_000,
    });
    // 上位者が不在のため、組織報酬の受取先は本人(agent-A)になる。
    expect(lines).toContainEqual({
      recipientType: "organization",
      recipientUserId: null,
      recipientAgentId: "agent-A",
      rate: 0.15,
      amountYen: 45_000,
    });
  });

  it("TC2: 別の代理店Bが城主Aの担当城の区画を販売 -> Aの組織には配分しない", () => {
    const lines = computeLandSaleCommissionLines({
      baseAmountYen: BASE_AMOUNT,
      rateSet: RATE_SET,
      lordContract: { contractId: "contract-A", lordUserId: "user-lord-A", status: "active" },
      sellingAgent: { agentId: "agent-B", rank: "アドバイザー", parentAgentId: "agent-org-1" },
      minRankForCommission: "アドバイザー",
      retroactivePayoutEnabled: false,
    });

    expect(lines).toHaveLength(3);
    expect(lines).toContainEqual(
      expect.objectContaining({ recipientType: "lord", recipientUserId: "user-lord-A", amountYen: 60_000 })
    );
    expect(lines).toContainEqual(
      expect.objectContaining({ recipientType: "agency", recipientAgentId: "agent-B", amountYen: 45_000 })
    );
    expect(lines).toContainEqual(
      expect.objectContaining({ recipientType: "organization", recipientAgentId: "agent-org-1", amountYen: 45_000 })
    );
    // Aの代理店IDが組織報酬の受取先に紛れ込んでいないことを明示的に確認する。
    expect(lines.some((l) => l.recipientAgentId === "agent-A")).toBe(false);
  });

  it("TC3: 城主候補(契約がactiveでない)が担当城の区画を販売 -> 城主報酬は計上しない", () => {
    const lines = computeLandSaleCommissionLines({
      baseAmountYen: BASE_AMOUNT,
      rateSet: RATE_SET,
      lordContract: { contractId: "contract-A", lordUserId: "user-lord-A", status: "training" },
      sellingAgent: { agentId: "agent-B", rank: "アドバイザー", parentAgentId: "agent-org-1" },
      minRankForCommission: "アドバイザー",
      retroactivePayoutEnabled: false,
    });

    expect(lines.some((l) => l.recipientType === "lord")).toBe(false);
    expect(lines).toHaveLength(2);
    expect(lines).toContainEqual(
      expect.objectContaining({ recipientType: "agency", amountYen: 45_000 })
    );
    expect(lines).toContainEqual(
      expect.objectContaining({ recipientType: "organization", amountYen: 45_000 })
    );
  });

  it("TC4: 代理店候補(アドバイザー未満)が外部顧客に販売 -> 販売報酬は計上しない", () => {
    const lines = computeLandSaleCommissionLines({
      baseAmountYen: BASE_AMOUNT,
      rateSet: RATE_SET,
      lordContract: null,
      sellingAgent: { agentId: "agent-C", rank: "代理店候補", parentAgentId: null },
      minRankForCommission: "アドバイザー",
      retroactivePayoutEnabled: false,
    });

    expect(lines).toHaveLength(0);
  });

  it("TC4補足: 遡及支払フラグがONなら資格未達でも計上する", () => {
    const lines = computeLandSaleCommissionLines({
      baseAmountYen: BASE_AMOUNT,
      rateSet: RATE_SET,
      lordContract: null,
      sellingAgent: { agentId: "agent-C", rank: "代理店候補", parentAgentId: null },
      minRankForCommission: "アドバイザー",
      retroactivePayoutEnabled: true,
    });

    expect(lines).toHaveLength(2);
  });

  it("TC7: Webhookが同一payment_intentに対して2回送信されても2回目は空配列", () => {
    const buildInput = (existing?: Set<RecipientType>) => ({
      baseAmountYen: BASE_AMOUNT,
      rateSet: RATE_SET,
      lordContract: { contractId: "contract-A", lordUserId: "user-lord-A", status: "active" as const },
      sellingAgent: { agentId: "agent-A", rank: "アドバイザー", parentAgentId: null },
      minRankForCommission: "アドバイザー",
      retroactivePayoutEnabled: false,
      existingRecipientTypes: existing,
    });

    const firstCallLines = computeLandSaleCommissionLines(buildInput());
    expect(firstCallLines).toHaveLength(3);

    const existingTypes = new Set(firstCallLines.map((l) => l.recipientType));
    const secondCallLines = computeLandSaleCommissionLines(buildInput(existingTypes));
    expect(secondCallLines).toHaveLength(0);
  });
});

describe("computeRefundAdjustments", () => {
  const heldLines: ExistingLedgerLine[] = [
    { id: "line-lord", recipientType: "lord", amountYen: 60_000, status: "held" },
    { id: "line-agency", recipientType: "agency", amountYen: 45_000, status: "held" },
    { id: "line-org", recipientType: "organization", amountYen: 45_000, status: "held" },
  ];

  const paidLines: ExistingLedgerLine[] = [
    { id: "line-lord", recipientType: "lord", amountYen: 60_000, status: "paid" },
    { id: "line-agency", recipientType: "agency", amountYen: 45_000, status: "paid" },
    { id: "line-org", recipientType: "organization", amountYen: 45_000, status: "paid" },
  ];

  it("TC5: 確定前(held)の取引が入金確定後・報酬確定前に全額返金 -> 3行すべて取消", () => {
    const result = computeRefundAdjustments({
      existingLines: heldLines,
      refundAmountYen: BASE_AMOUNT,
      baseAmountYen: BASE_AMOUNT,
    });

    expect(result.cancelLineIds.sort()).toEqual(["line-agency", "line-lord", "line-org"].sort());
    expect(result.reversalLines).toHaveLength(0);
  });

  it("TC6: 確定・支払後(paid)の取引が半額返金 -> 按分した反対仕訳を新規作成、元行は変更しない", () => {
    const result = computeRefundAdjustments({
      existingLines: paidLines,
      refundAmountYen: BASE_AMOUNT / 2,
      baseAmountYen: BASE_AMOUNT,
    });

    expect(result.cancelLineIds).toHaveLength(0);
    expect(result.reversalLines).toHaveLength(3);
    expect(result.reversalLines).toContainEqual({ originalLineId: "line-lord", recipientType: "lord", amountYen: -30_000 });
    expect(result.reversalLines).toContainEqual({
      originalLineId: "line-agency",
      recipientType: "agency",
      amountYen: -22_500,
    });
    expect(result.reversalLines).toContainEqual({
      originalLineId: "line-org",
      recipientType: "organization",
      amountYen: -22_500,
    });
  });

  it("既に反対仕訳・取消済みの行は対象から除外する", () => {
    const mixedLines: ExistingLedgerLine[] = [
      ...paidLines,
      { id: "line-already-reversed", recipientType: "lord", amountYen: 60_000, status: "reversed" },
    ];
    const result = computeRefundAdjustments({
      existingLines: mixedLines,
      refundAmountYen: BASE_AMOUNT,
      baseAmountYen: BASE_AMOUNT,
    });

    expect(result.reversalLines.some((l) => l.originalLineId === "line-already-reversed")).toBe(false);
  });
});

describe("validateRuleSetRates", () => {
  it("accepts a rate set that sums to exactly 100%", () => {
    expect(validateRuleSetRates(RATE_SET)).toBe(true);
  });

  it("rejects a rate set that does not sum to 100%", () => {
    expect(validateRuleSetRates({ ...RATE_SET, hq_rate: 0.5 })).toBe(false);
  });
});
