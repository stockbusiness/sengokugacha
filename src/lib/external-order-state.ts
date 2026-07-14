// 外部購入管理(戦国パスポート開発者向け実装指示書v1.0 5-2・7章)の注文状態遷移マトリクス。
// castle-lord-contracts.tsの状態機械パターンをそのまま踏襲する。

export const EXTERNAL_ORDER_STATUSES = [
  "draft",
  "payment_pending",
  "payment_confirmed",
  "user_link_pending",
  "plot_assignment_pending",
  "partially_assigned",
  "ready_to_grant",
  "rights_granted",
  "cancel_pending",
  "cancelled",
  "refunded",
  "on_hold",
] as const;

export type ExternalOrderStatus = (typeof EXTERNAL_ORDER_STATUSES)[number];

const ORDER_TRANSITIONS: Record<ExternalOrderStatus, ExternalOrderStatus[]> = {
  draft: ["payment_pending", "cancel_pending", "on_hold"],
  payment_pending: ["payment_confirmed", "cancel_pending", "on_hold"],
  payment_confirmed: ["user_link_pending", "cancel_pending", "on_hold"],
  user_link_pending: ["plot_assignment_pending", "cancel_pending", "on_hold"],
  plot_assignment_pending: ["partially_assigned", "ready_to_grant", "cancel_pending", "on_hold"],
  partially_assigned: ["ready_to_grant", "plot_assignment_pending", "cancel_pending", "on_hold"],
  ready_to_grant: ["rights_granted", "partially_assigned", "cancel_pending", "on_hold"], // partially_assignedへの逆行は権利付与前に割当を取り消した場合
  rights_granted: ["cancel_pending", "on_hold"], // 権利付与後のキャンセル・返金にも対応(9-1)
  cancel_pending: ["cancelled", "refunded", "on_hold"],
  cancelled: [], // 終端状態
  refunded: [], // 終端状態
  on_hold: [
    "payment_pending",
    "payment_confirmed",
    "user_link_pending",
    "plot_assignment_pending",
    "partially_assigned",
    "ready_to_grant",
    "rights_granted",
    "cancel_pending",
  ],
};

// 本部担当者(operator)が実行できる遷移。それ以外は本部管理者(manager)限定
// (実装計画8章の権限表に対応: 入金確認確定・ユーザー紐付け確定・権利付与確定・
// 権利取消/区画変更・強制登録/強制解除はmanager限定、それ以外の登録・区画割当案作成は
// operatorも実行可能)。
const OPERATOR_ALLOWED_TRANSITIONS: Set<string> = new Set([
  "draft:payment_pending",
  "draft:on_hold",
  "payment_pending:on_hold",
  "payment_confirmed:on_hold",
  "user_link_pending:on_hold",
  "plot_assignment_pending:partially_assigned",
  "plot_assignment_pending:ready_to_grant",
  "plot_assignment_pending:on_hold",
  "partially_assigned:ready_to_grant",
  "partially_assigned:plot_assignment_pending",
  "partially_assigned:on_hold",
  "ready_to_grant:partially_assigned",
  "ready_to_grant:on_hold",
]);

export function isValidExternalOrderTransition(from: ExternalOrderStatus, to: ExternalOrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canOperatorPerformOrderTransition(from: ExternalOrderStatus, to: ExternalOrderStatus): boolean {
  return OPERATOR_ALLOWED_TRANSITIONS.has(`${from}:${to}`);
}

export class InvalidExternalOrderTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`${from}から${to}への遷移は許可されていません`);
    this.name = "InvalidExternalOrderTransitionError";
  }
}
