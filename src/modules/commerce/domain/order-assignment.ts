// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 4(§8、commerce)。
// src/lib/external-orders.tsから移設。
// 注文明細の必要数と割当済み数から、注文全体の割当状況を判定する純粋関数(単体テスト対象)。

export type AssignmentProgress = { quantity: number; assignedCount: number };

export function computeOrderAssignmentStatus(
  items: AssignmentProgress[]
): "plot_assignment_pending" | "partially_assigned" | "ready_to_grant" {
  const totalAssigned = items.reduce((sum, item) => sum + item.assignedCount, 0);
  if (totalAssigned === 0) return "plot_assignment_pending";
  const fullyAssigned = items.every((item) => item.assignedCount >= item.quantity);
  return fullyAssigned ? "ready_to_grant" : "partially_assigned";
}
