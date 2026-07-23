import { meetsMinimumRank } from "@/lib/agent-rank";

// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 4(§8、castle)。
// src/lib/castle-commission-engine.tsから移設。
// 要件書8章の報酬計算・8.6の返金調整ロジック。DB非依存の純粋関数のみをここに置き、
// 永続化(commission_ledger/commission_adjustmentsへの書込)はsrc/lib/castle-commissions.ts
// (DB書込層)で行う。gacha-rate-tiers.tsと同じ設計方針(本リポジトリにDBモック基盤が
// 無いため、テスト可能な計算ロジックを純粋関数として切り出す)。

export type RecipientType = "lord" | "agency" | "organization" | "hq" | "development_fund" | "regional_activity";

export type CommissionRateSet = {
  lord_rate: number;
  agency_rate: number;
  organization_rate: number;
  regional_activity_rate: number;
  development_fund_rate: number;
  hq_rate: number;
};

export type CommissionLine = {
  recipientType: RecipientType;
  recipientUserId: string | null;
  recipientAgentId: string | null;
  rate: number;
  amountYen: number;
};

export type SellingAgentInfo = {
  agentId: string;
  rank: string;
  parentAgentId: string | null;
};

export type LordContractInfo = {
  contractId: string;
  lordUserId: string;
  status: string; // 'active'以外(8.7 TC3の城主候補等)ではlord行を計上しない
};

export type ComputeLandSaleCommissionLinesInput = {
  baseAmountYen: number; // 8.1「報酬計算対象額」(税抜換算後の入金額-返金-対象外税額)
  rateSet: CommissionRateSet;
  lordContract: LordContractInfo | null;
  sellingAgent: SellingAgentInfo | null;
  minRankForCommission: string;
  retroactivePayoutEnabled: boolean;
  // TC7(Webhook重複送信)対応。既にこの注文に対して計上済みの受取区分。
  existingRecipientTypes?: Set<RecipientType>;
};

function round(amount: number): number {
  return Math.round(amount);
}

// 8.3/8.4「城主本人が販売した場合」「別の代理店が販売した場合」は、実装上は同一ロジックで
// 表現できる。lord行は常に契約の城主(lordContract.lordUserId)固定、agency/organization行は
// 常に実際に販売したsellingAgentを基準にする。sellingAgent.agentIdが城主自身の代理店IDと
// 一致する(=城主本人が売った)かどうかは呼び出し側の情報構築時点で吸収され、この関数自体は
// 「誰が売ったか」だけを見ればよい。
export function computeLandSaleCommissionLines(input: ComputeLandSaleCommissionLinesInput): CommissionLine[] {
  const lines: CommissionLine[] = [];
  const existing = input.existingRecipientTypes ?? new Set<RecipientType>();

  // 8.7 TC3: 城主契約が有効(active)でなければ城主報酬は計上しない。
  if (input.lordContract && input.lordContract.status === "active") {
    lines.push({
      recipientType: "lord",
      recipientUserId: input.lordContract.lordUserId,
      recipientAgentId: null,
      rate: input.rateSet.lord_rate,
      amountYen: round(input.baseAmountYen * input.rateSet.lord_rate),
    });
  }

  // 8.7 TC4: 資格未達(アドバイザー未満)の代理店は、遡及支払が有効でない限り
  // 販売代理店報酬・組織報酬を計上しない(その場合の実績記録はagent_sales側のみで行う)。
  if (
    input.sellingAgent &&
    (meetsMinimumRank(input.sellingAgent.rank, input.minRankForCommission) || input.retroactivePayoutEnabled)
  ) {
    lines.push({
      recipientType: "agency",
      recipientUserId: null,
      recipientAgentId: input.sellingAgent.agentId,
      rate: input.rateSet.agency_rate,
      amountYen: round(input.baseAmountYen * input.rateSet.agency_rate),
    });

    // 8.3「資格に応じた組織報酬」。既存コードに複数階層按分ロジックが無いため、
    // 直近1階層(parentAgentId)を組織報酬の受取先とする。上位者が不在なら本人。
    lines.push({
      recipientType: "organization",
      recipientUserId: null,
      recipientAgentId: input.sellingAgent.parentAgentId ?? input.sellingAgent.agentId,
      rate: input.rateSet.organization_rate,
      amountYen: round(input.baseAmountYen * input.rateSet.organization_rate),
    });
  }

  return lines.filter((line) => !existing.has(line.recipientType));
}

export type ExistingLedgerLine = {
  id: string;
  recipientType: RecipientType;
  amountYen: number;
  status: "pending" | "held" | "confirmed" | "payable" | "paid" | "reversed";
};

export type ReversalLine = {
  originalLineId: string;
  recipientType: RecipientType;
  amountYen: number;
};

export type RefundAdjustmentResult = {
  cancelLineIds: string[];
  reversalLines: ReversalLine[];
};

// 8.6「返金・取消」。確定前(pending/held)の行は取消、確定後・支払後(confirmed/payable/paid)の
// 行は反対仕訳を新規作成する(元の行は削除・変更しない)。部分返金は按分する。
export function computeRefundAdjustments(input: {
  existingLines: ExistingLedgerLine[];
  refundAmountYen: number;
  baseAmountYen: number;
}): RefundAdjustmentResult {
  const cancelLineIds: string[] = [];
  const reversalLines: ReversalLine[] = [];
  const refundRatio = input.baseAmountYen > 0 ? Math.min(1, input.refundAmountYen / input.baseAmountYen) : 0;

  for (const line of input.existingLines) {
    if (line.status === "reversed") continue; // 既に取消・反対仕訳済みの行は対象外

    if (line.status === "pending" || line.status === "held") {
      cancelLineIds.push(line.id);
      continue;
    }

    const amountYen = -round(line.amountYen * refundRatio);
    if (amountYen !== 0) {
      reversalLines.push({ originalLineId: line.id, recipientType: line.recipientType, amountYen });
    }
  }

  return { cancelLineIds, reversalLines };
}

export function validateRuleSetRates(rateSet: CommissionRateSet): boolean {
  const total =
    rateSet.lord_rate +
    rateSet.agency_rate +
    rateSet.organization_rate +
    rateSet.regional_activity_rate +
    rateSet.development_fund_rate +
    rateSet.hq_rate;
  return Math.abs(total - 1) < 0.0001;
}
