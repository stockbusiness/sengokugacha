import { logAdminAction } from "@/lib/admin-audit-log";
import { notifyExternalOrderEvent } from "@/lib/external-order-notifications";
import { transitionExternalOrder } from "@/modules/commerce/application/external-order-transitions";
import type { ExternalOrderRepository } from "@/modules/commerce/application/external-order-ports";

// ============================================================
// キャンセル・返金・権利取消(9章)。
// ============================================================

export type CancelResolution = "cancelled" | "refunded";

// 外部ショップで返金・取消が完了した後の手動反映(9-1)。戦国パスポートから外部ショップの
// 返金処理自体は行わない。有効な区画割当・権利をすべて取り消し、区画を再販売可能へ戻す。
export async function cancelExternalOrder(
  repository: ExternalOrderRepository,
  orderId: string,
  resolution: CancelResolution,
  reason: string,
  actorName: string | null
) {
  const order = await repository.findOrderForCancel(orderId);
  if (!order) throw new Error("注文が見つかりません");

  if (order.status !== "cancel_pending") {
    await transitionExternalOrder(repository, orderId, "cancel_pending", actorName, "manager", reason);
  }

  const itemIds = await repository.findAllItemIds(orderId);
  const assignments = itemIds.length ? await repository.findAssignedAssignments(itemIds) : [];

  const nowIso = new Date().toISOString();
  for (const assignment of assignments) {
    await repository.cancelAssignment(assignment.id, nowIso);
    // 割当のみ(reserved)・権利付与済み(sold)のどちらであっても再販売可能へ戻し、
    // 所有者情報をクリアする(9-2「区画を再販売可能へ変更」「/my-landの状態を更新」)。
    await repository.releasePlotToAvailable(assignment.plot_id, nowIso);
  }

  await transitionExternalOrder(repository, orderId, resolution, actorName, "manager", reason);

  await logAdminAction(actorName, "external_order_cancel", `resolution=${resolution} reason=${reason}`, {
    targetType: "external_order",
    targetId: orderId,
    after: { resolution, reason },
  });

  if (order.linked_user_id) {
    const lineUserId = await repository.findUserLineUserId(order.linked_user_id);
    await notifyExternalOrderEvent(orderId, lineUserId, resolution === "refunded" ? "refund_applied" : "rights_revoked");
  }
}

// 一部取消(9-4「複数区画注文の一部のみ取消できる設計とする」)。特定の注文明細
// (=区画1件分)のみを取消し、他の明細・注文全体の状態には影響させない。
// この明細に紐づく有効な区画割当・区画権利(割当のみ/権利付与済みどちらも)を
// 取り消し、区画を再販売可能へ戻す。全明細が取消済みになった場合のみ、
// 注文全体もcancelExternalOrder()と同じ経路でcancel_pending→resolutionへ進める。
export async function cancelExternalOrderItem(
  repository: ExternalOrderRepository,
  orderItemId: string,
  resolution: CancelResolution,
  reason: string,
  actorName: string | null
) {
  const item = await repository.findOrderItemWithStatus(orderItemId);
  if (!item) throw new Error("注文明細が見つかりません");
  if (item.status === "cancelled") throw new Error("この注文明細はすでに取消済みです");

  const assignments = await repository.findAssignedAssignmentsForItem(orderItemId);

  const nowIso = new Date().toISOString();
  for (const assignment of assignments) {
    await repository.cancelAssignment(assignment.id, nowIso);
    await repository.releasePlotToAvailable(assignment.plot_id, nowIso);
  }

  await repository.markItemCancelled(orderItemId);

  await logAdminAction(actorName, "external_order_item_cancel", `order_item_id=${orderItemId} reason=${reason}`, {
    targetType: "external_order_item",
    targetId: orderItemId,
    after: { reason },
  });

  // 全明細が取消済みになっていたら、注文全体もキャンセル/返金として確定する
  // (この場合はcancelExternalOrder()側が全体向けの通知を送るため、ここでの
  // plot_changed通知は重複を避けて送らない)。
  const remainingCount = await repository.countActiveItems(item.order_id);

  if (remainingCount === 0) {
    await cancelExternalOrder(repository, item.order_id, resolution, reason, actorName);
  } else {
    const lineUserId = await repository.findLineUserIdForOrder(item.order_id);
    await notifyExternalOrderEvent(item.order_id, lineUserId, "plot_changed");
  }
}
