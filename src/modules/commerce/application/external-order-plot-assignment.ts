import { logAdminAction } from "@/lib/admin-audit-log";
import { notifyExternalOrderEvent } from "@/lib/external-order-notifications";
import type { ExternalOrderStatus } from "@/lib/external-order-state";
import { computeOrderAssignmentStatus, type AssignmentProgress } from "@/modules/commerce/domain/order-assignment";
import { transitionExternalOrder, type AdminRole } from "@/modules/commerce/application/external-order-transitions";
import type { ExternalOrderRepository } from "@/modules/commerce/application/external-order-ports";

export { computeOrderAssignmentStatus, type AssignmentProgress };

export class PlotNotAssignableError extends Error {
  constructor() {
    super("この区画は現在割り当てできません(すでに他の注文へ割り当て済み、または販売可能状態ではありません)");
    this.name = "PlotNotAssignableError";
  }
}

// ============================================================
// 区画割当(7章)。
// ============================================================

async function getItemsWithAssignedCounts(repository: ExternalOrderRepository, orderId: string) {
  // 一部取消(9-4)でcancelledになった明細は、割当状況の集計・権利付与の対象から除外する。
  const items = await repository.findActiveItemsWithQuantity(orderId);
  const itemIds = items.map((i) => i.id);
  const countByItem = itemIds.length ? await repository.countAssignedByItemIds(itemIds) : new Map<string, number>();

  return items.map((item) => ({
    id: item.id,
    quantity: item.quantity,
    assignedCount: countByItem.get(item.id) ?? 0,
  }));
}

async function recomputeAndTransition(repository: ExternalOrderRepository, orderId: string, actorName: string | null, role: AdminRole) {
  const items = await getItemsWithAssignedCounts(repository, orderId);
  const nextStatus = computeOrderAssignmentStatus(items);

  const order = await repository.findOrderForTransition(orderId);
  if (!order) throw new Error("注文が見つかりません");

  if (order.status !== nextStatus) {
    await transitionExternalOrder(repository, orderId, nextStatus as ExternalOrderStatus, actorName, role);
    // 個々の区画割当ごとに通知すると煩雑なため、全区画の割当が揃った時点(ready_to_grant到達時)
    // のみ「区画割当完了」を通知する。
    if (nextStatus === "ready_to_grant") {
      const lineUserId = await repository.findLineUserIdForOrder(orderId);
      await notifyExternalOrderEvent(orderId, lineUserId, "plot_assigned");
    }
  }
}

export async function getAssignablePlots(repository: ExternalOrderRepository, orderId: string) {
  const castleId = await repository.findOrderCastleId(orderId);
  return repository.findAvailablePlots(castleId);
}

export async function assignPlotToOrderItem(
  repository: ExternalOrderRepository,
  orderItemId: string,
  plotId: string,
  actorName: string | null
) {
  const item = await repository.findOrderItem(orderItemId);
  if (!item) throw new Error("注文明細が見つかりません");

  const assignedCount = await repository.countAssignedForItem(orderItemId);
  if (assignedCount >= item.quantity) {
    throw new Error("この注文明細はすでに必要数の区画が割り当て済みです");
  }

  // plot_idの部分ユニークインデックス違反=7-4の二重割当防止。
  let assignment: { id: string };
  try {
    assignment = await repository.insertPlotAssignment(orderItemId, plotId, actorName);
  } catch {
    throw new PlotNotAssignableError();
  }

  const nowIso = new Date().toISOString();
  const claimed = await repository.claimPlotReserved(plotId, nowIso);
  if (!claimed) {
    // 区画がすでにavailableではなかった(競合)。割当を補償ロールバックする。
    await repository.deletePlotAssignment(assignment.id);
    throw new PlotNotAssignableError();
  }

  await recomputeAndTransition(repository, item.order_id, actorName, "operator");

  await logAdminAction(actorName, "external_order_assign_plot", `plot_id=${plotId}`, {
    targetType: "external_order",
    targetId: item.order_id,
    after: { orderItemId, plotId },
  });
}

export async function unassignPlotFromOrderItem(repository: ExternalOrderRepository, assignmentId: string, actorName: string | null) {
  const assignment = await repository.findAssignment(assignmentId);
  if (!assignment) throw new Error("区画割当が見つかりません");
  if (assignment.status !== "assigned") throw new Error("この区画割当はすでに解除済みです");

  const orderId = await repository.findItemOrderId(assignment.order_item_id);
  if (!orderId) throw new Error("注文明細が見つかりません");

  const nowIso = new Date().toISOString();
  await repository.cancelAssignment(assignmentId, nowIso);
  await repository.releasePlotFromReserved(assignment.plot_id, nowIso);

  await recomputeAndTransition(repository, orderId, actorName, "operator");

  await logAdminAction(actorName, "external_order_unassign_plot", `plot_id=${assignment.plot_id}`, {
    targetType: "external_order",
    targetId: orderId,
    before: { orderItemId: assignment.order_item_id, plotId: assignment.plot_id },
  });
}
