import type { ExternalOrderStatus } from "@/lib/external-order-state";
import type { ExternalOrderRepository } from "@/modules/commerce/application/external-order-ports";

// ============================================================
// 一覧・詳細(4章)。
// ============================================================

export type ExternalOrderListFilters = {
  status?: ExternalOrderStatus[];
  castleId?: string;
  unresolvedOnly?: boolean; // ユーザー未紐付け or 権利未付与のもの(4-12「未処理案件」相当)
  search?: string; // 外部注文ID・購入者氏名
};

export async function listExternalOrders(repository: ExternalOrderRepository, filters: ExternalOrderListFilters = {}) {
  return repository.listOrders(filters);
}

export async function getExternalOrderDetail(repository: ExternalOrderRepository, orderId: string) {
  const [order, items, history, notifications] = await Promise.all([
    repository.findOrderWithCastle(orderId),
    repository.findItemsForDetail(orderId),
    repository.findStatusHistoryForDetail(orderId),
    repository.findNotificationsForDetail(orderId),
  ]);
  if (!order) return null;

  const itemIds = items.map((i) => i.id as string);
  const assignments = itemIds.length ? await repository.findAssignmentsForDetail(itemIds) : [];

  const assignmentsByItem = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = assignmentsByItem.get(a.order_item_id as string) ?? [];
    list.push(a);
    assignmentsByItem.set(a.order_item_id as string, list);
  }

  return {
    order,
    items: items.map((item) => ({
      ...item,
      assignments: assignmentsByItem.get(item.id as string) ?? [],
    })),
    history,
    notifications,
  };
}
