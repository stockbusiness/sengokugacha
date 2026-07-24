import { logAdminAction } from "@/lib/admin-audit-log";
import { notifyExternalOrderEvent } from "@/lib/external-order-notifications";
import { transitionExternalOrder } from "@/modules/commerce/application/external-order-transitions";
import type { ExternalOrderRepository } from "@/modules/commerce/application/external-order-ports";

// ============================================================
// 区画権利付与(8章)。DBトランザクションが本リポジトリに存在しないため
// (現状監査14項目め参照)、事前条件チェックをすべて先に行った上で、各区画更新は
// 「まだ確定していない行だけを対象にする」ガード付きupdateにして再試行安全にする。
// ============================================================

export type GrantRightsResult = { orderId: string; grantedPlotIds: string[]; linkedUserId: string };

export async function grantExternalOrderRights(
  repository: ExternalOrderRepository,
  orderId: string,
  actorName: string | null
): Promise<GrantRightsResult> {
  const order = await repository.findOrderForGrant(orderId);
  if (!order) throw new Error("注文が見つかりません");
  if (order.status !== "ready_to_grant") {
    throw new Error("権利付与は「権利付与準備完了」状態の注文のみ実行できます");
  }
  if (!order.payment_confirmed_at) throw new Error("入金確認が完了していません");
  if (!order.linked_user_id) throw new Error("購入者とLINEユーザーの紐付けが完了していません");

  // 一部取消(9-4)でcancelledになった明細は対象外にする。
  const items = await repository.findActiveItemsWithUnitPrice(orderId);
  const itemIds = items.map((i) => i.id);
  const assignments = itemIds.length ? await repository.findAssignedAssignments(itemIds) : [];

  const unitPriceByItem = new Map(items.map((i) => [i.id, i.unit_price_yen]));
  const assignedCountByItem = new Map<string, number>();
  for (const a of assignments) {
    assignedCountByItem.set(a.order_item_id, (assignedCountByItem.get(a.order_item_id) ?? 0) + 1);
  }
  const fullyAssigned = items.every((item) => (assignedCountByItem.get(item.id) ?? 0) >= item.quantity);
  if (!fullyAssigned) throw new Error("すべての注文明細に必要数の区画が割り当てられていません");

  const plotIds = assignments.map((a) => a.plot_id);
  const plots = plotIds.length ? await repository.findPlotStatuses(plotIds) : [];
  const staleSold = plots.filter((p) => p.status !== "reserved");
  if (staleSold.length > 0) {
    throw new Error("割当済み区画の一部がすでに販売済み・変更されています。区画割当をご確認ください");
  }

  const nowIso = new Date().toISOString();
  const grantedPlotIds: string[] = [];
  for (const assignment of assignments) {
    const unitPriceYen = unitPriceByItem.get(assignment.order_item_id) ?? null;
    // 再試行時に既に確定済みの行を二重更新しないためのガード(claimPlotSold内でstatus='reserved'条件)。
    const granted = await repository.claimPlotSold(assignment.plot_id, order.linked_user_id, nowIso, unitPriceYen, assignment.order_item_id);
    if (granted) grantedPlotIds.push(assignment.plot_id);
  }

  await transitionExternalOrder(repository, orderId, "rights_granted", actorName, "manager");

  await logAdminAction(actorName, "external_order_grant_rights", `plots=${grantedPlotIds.join(",")}`, {
    targetType: "external_order",
    targetId: orderId,
    after: { linkedUserId: order.linked_user_id, grantedPlotIds },
  });

  const lineUserId = await repository.findLineUserIdForOrder(orderId);
  await notifyExternalOrderEvent(orderId, lineUserId, "rights_granted");

  return { orderId, grantedPlotIds, linkedUserId: order.linked_user_id };
}
