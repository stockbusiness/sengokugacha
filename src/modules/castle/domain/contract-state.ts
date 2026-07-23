// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 4(§8、castle)。
// src/lib/castle-lord-contracts.tsから移設。
// 要件書6.4の契約状態遷移マトリクスをそのままコードで表現する。
export const CONTRACT_STATUSES = [
  "draft",
  "screening",
  "approved",
  "payment_pending",
  "training",
  "active",
  "suspended",
  "expired",
  "terminated",
] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ["screening", "terminated"],
  screening: ["approved", "terminated"], // terminatedは却下を意味する
  approved: ["payment_pending", "terminated"],
  payment_pending: ["approved", "training", "terminated"], // approvedへの逆行は入金失敗時
  training: ["active", "terminated"], // terminatedは研修放棄
  active: ["suspended", "expired", "terminated"],
  suspended: ["active", "expired", "terminated"], // activeへの復帰は本部承認が前提
  expired: ["active", "terminated"], // activeへの復帰は更新承認が前提
  terminated: [], // 終端状態。以降の遷移は一切許可しない
};

// 本部担当者(operator)が実行できる遷移。それ以外は本部管理者(manager)限定
// (要件書5.2「城主は本部承認なしに...」「報酬の手動変更は本部管理者のみ」の考え方を踏襲し、
// 入金確定以降=payment_pendingからの遷移は財務・契約継続性への影響が大きいためmanager限定とする)。
const OPERATOR_ALLOWED_TRANSITIONS: Set<string> = new Set([
  "draft:screening",
  "draft:terminated",
  "screening:approved",
  "screening:terminated",
  "approved:payment_pending",
]);

export function isValidContractTransition(from: ContractStatus, to: ContractStatus): boolean {
  return CONTRACT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canOperatorPerformTransition(from: ContractStatus, to: ContractStatus): boolean {
  return OPERATOR_ALLOWED_TRANSITIONS.has(`${from}:${to}`);
}

export class InvalidContractTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`${from}から${to}への遷移は許可されていません`);
    this.name = "InvalidContractTransitionError";
  }
}
