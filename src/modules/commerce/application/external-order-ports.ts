import type { ExternalOrderStatus } from "@/lib/external-order-state";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase B-1(commerceモジュール、PR4)。
// external-orders.tsのRepositoryインターフェース(ポート)。application層はこのインターフェース
// のみに依存し、Supabase等のインフラ詳細を知らない。
//
// このファイルにはDBトランザクションが本リポジトリに存在しないため(現状監査で確認済み)、
// 元の実装は「事前条件チェックをすべて先に行った上で、各更新は『まだ確定していない行だけを
// 対象にする』ガード付きupdateにして再試行安全にする」設計になっている。この設計自体は
// 変更せず、個々のDB操作をそのままRepositoryメソッドとして切り出す(最小リスク方針)。

export type ExternalOrderRow = {
  id: string;
  status: ExternalOrderStatus;
  linked_user_id: string | null;
  payment_confirmed_at: string | null;
  castle_id: string | null;
  [key: string]: unknown;
};

export type ExternalOrderItemRow = { id: string; quantity: number; unit_price_yen?: number; status?: string };

export type PlotAssignmentRow = { id: string; order_item_id: string; plot_id: string; status: string };

export type CreateExternalOrderRecord = {
  externalShopName: string;
  externalOrderId: string;
  amountYen: number;
  currency: string;
  buyerName: string;
  buyerNameKana: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  externalCustomerId: string | null;
  externalAgentId: string | null;
  agentNameSnapshot: string | null;
  agentSalesRepSnapshot: string | null;
  referralUrlOrCode: string | null;
  castleId: string | null;
  adminMemo: string | null;
  registeredBy: string | null;
};

export type CreateExternalOrderItemRecord = {
  externalProductId: string | null;
  productName: string;
  quantity: number;
  unitPriceYen: number;
  subtotalYen: number;
};

export interface ExternalOrderRepository {
  // --- 注文状態遷移 ---
  findOrderForTransition(orderId: string): Promise<ExternalOrderRow | null>;
  updateOrderStatus(orderId: string, toStatus: ExternalOrderStatus, updatedAtIso: string): Promise<void>;
  insertStatusHistory(
    orderId: string,
    fromStatus: ExternalOrderStatus,
    toStatus: ExternalOrderStatus,
    changedBy: string | null,
    reason: string | null,
    snapshotBefore: ExternalOrderRow
  ): Promise<void>;
  updatePaymentConfirmedAt(orderId: string, confirmedAtIso: string): Promise<void>;

  // --- 注文登録 ---
  insertOrder(input: CreateExternalOrderRecord): Promise<ExternalOrderRow>;
  insertOrderItems(orderId: string, items: CreateExternalOrderItemRecord[]): Promise<void>;
  deleteOrder(orderId: string): Promise<void>;

  // --- 紐付け ---
  updateLinkedUser(orderId: string, userId: string | null): Promise<void>;
  findUserLineUserId(userId: string): Promise<string | null>;
  findLineUserIdForOrder(orderId: string): Promise<string | null>;

  // --- 区画割当 ---
  findActiveItemsWithQuantity(orderId: string): Promise<{ id: string; quantity: number }[]>;
  countAssignedByItemIds(itemIds: string[]): Promise<Map<string, number>>;
  findOrderCastleId(orderId: string): Promise<string | null>;
  findAvailablePlots(castleId: string | null): Promise<Record<string, unknown>[]>;
  findOrderItem(orderItemId: string): Promise<{ id: string; order_id: string; quantity: number } | null>;
  countAssignedForItem(orderItemId: string): Promise<number>;
  insertPlotAssignment(orderItemId: string, plotId: string, assignedBy: string | null): Promise<{ id: string }>;
  claimPlotReserved(plotId: string, updatedAtIso: string): Promise<boolean>;
  deletePlotAssignment(assignmentId: string): Promise<void>;
  findAssignment(assignmentId: string): Promise<{ id: string; order_item_id: string; plot_id: string; status: string } | null>;
  findItemOrderId(orderItemId: string): Promise<string | null>;
  cancelAssignment(assignmentId: string, unassignedAtIso: string): Promise<void>;
  releasePlotFromReserved(plotId: string, updatedAtIso: string): Promise<void>;

  // --- 区画権利付与 ---
  findOrderForGrant(orderId: string): Promise<ExternalOrderRow | null>;
  findActiveItemsWithUnitPrice(orderId: string): Promise<{ id: string; quantity: number; unit_price_yen: number }[]>;
  findAssignedAssignments(itemIds: string[]): Promise<PlotAssignmentRow[]>;
  findPlotStatuses(plotIds: string[]): Promise<{ id: string; status: string }[]>;
  claimPlotSold(
    plotId: string,
    ownerUserId: string,
    soldAtIso: string,
    soldPriceYen: number | null,
    sourceOrderItemId: string
  ): Promise<boolean>;

  // --- キャンセル・返金・権利取消 ---
  findOrderForCancel(orderId: string): Promise<{ id: string; status: ExternalOrderStatus; linked_user_id: string | null } | null>;
  findAllItemIds(orderId: string): Promise<string[]>;
  releasePlotToAvailable(plotId: string, updatedAtIso: string): Promise<void>;
  findOrderItemWithStatus(orderItemId: string): Promise<{ id: string; order_id: string; status: string } | null>;
  findAssignedAssignmentsForItem(orderItemId: string): Promise<{ id: string; plot_id: string }[]>;
  markItemCancelled(orderItemId: string): Promise<void>;
  countActiveItems(orderId: string): Promise<number>;

  // --- 一覧・詳細 ---
  listOrders(filters: {
    status?: ExternalOrderStatus[];
    castleId?: string;
    unresolvedOnly?: boolean;
    search?: string;
  }): Promise<Record<string, unknown>[]>;
  findOrderWithCastle(orderId: string): Promise<Record<string, unknown> | null>;
  findItemsForDetail(orderId: string): Promise<Record<string, unknown>[]>;
  findStatusHistoryForDetail(orderId: string): Promise<Record<string, unknown>[]>;
  findNotificationsForDetail(orderId: string): Promise<Record<string, unknown>[]>;
  findAssignmentsForDetail(itemIds: string[]): Promise<Record<string, unknown>[]>;
}
