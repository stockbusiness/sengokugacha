import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { ExternalOrderStatus } from "@/lib/external-order-state";
import type {
  CreateExternalOrderItemRecord,
  CreateExternalOrderRecord,
  ExternalOrderRepository,
  ExternalOrderRow,
  PlotAssignmentRow,
} from "@/modules/commerce/application/external-order-ports";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// ExternalOrderRepositoryのSupabase実装。既存のsrc/lib/external-orders.tsに実装されて
// いたクエリをそのまま移設したもの。本リポジトリにDBトランザクションが存在しないため、
// 元の実装のガード付きupdate・補償ロールバックの設計はそのまま維持している。
export class SupabaseExternalOrderRepository implements ExternalOrderRepository {
  private readonly supabase: SupabaseServerClient;

  constructor(supabase: SupabaseServerClient = createSupabaseServerClient()) {
    this.supabase = supabase;
  }

  // --- 注文状態遷移 ---

  async findOrderForTransition(orderId: string): Promise<ExternalOrderRow | null> {
    const { data, error } = await this.supabase.from("external_orders").select("*").eq("id", orderId).maybeSingle();
    if (error) throw error;
    return (data as ExternalOrderRow | null) ?? null;
  }

  async updateOrderStatus(orderId: string, toStatus: ExternalOrderStatus, updatedAtIso: string): Promise<void> {
    const { error } = await this.supabase.from("external_orders").update({ status: toStatus, updated_at: updatedAtIso }).eq("id", orderId);
    if (error) throw error;
  }

  async insertStatusHistory(
    orderId: string,
    fromStatus: ExternalOrderStatus,
    toStatus: ExternalOrderStatus,
    changedBy: string | null,
    reason: string | null,
    snapshotBefore: ExternalOrderRow
  ): Promise<void> {
    const { error } = await this.supabase.from("external_order_status_histories").insert({
      order_id: orderId,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: changedBy,
      reason,
      snapshot_before: snapshotBefore,
    });
    if (error) throw error;
  }

  async updatePaymentConfirmedAt(orderId: string, confirmedAtIso: string): Promise<void> {
    const { error } = await this.supabase.from("external_orders").update({ payment_confirmed_at: confirmedAtIso }).eq("id", orderId);
    if (error) throw error;
  }

  // --- 注文登録 ---

  async insertOrder(input: CreateExternalOrderRecord): Promise<ExternalOrderRow> {
    const { data, error } = await this.supabase
      .from("external_orders")
      .insert({
        external_shop_name: input.externalShopName,
        external_order_id: input.externalOrderId,
        amount_yen: input.amountYen,
        currency: input.currency,
        buyer_name: input.buyerName,
        buyer_name_kana: input.buyerNameKana,
        buyer_email: input.buyerEmail,
        buyer_phone: input.buyerPhone,
        external_customer_id: input.externalCustomerId,
        external_agent_id: input.externalAgentId,
        agent_name_snapshot: input.agentNameSnapshot,
        agent_sales_rep_snapshot: input.agentSalesRepSnapshot,
        referral_url_or_code: input.referralUrlOrCode,
        castle_id: input.castleId,
        admin_memo: input.adminMemo,
        registered_by: input.registeredBy,
      })
      .select("*")
      .single();
    // external_shop_name + external_order_id のユニーク制約違反=5-3の重複登録防止。
    if (error) throw error;
    return data as ExternalOrderRow;
  }

  async insertOrderItems(orderId: string, items: CreateExternalOrderItemRecord[]): Promise<void> {
    const { error } = await this.supabase.from("external_order_items").insert(
      items.map((item) => ({
        order_id: orderId,
        external_product_id: item.externalProductId,
        product_name: item.productName,
        quantity: item.quantity,
        unit_price_yen: item.unitPriceYen,
        subtotal_yen: item.subtotalYen,
      }))
    );
    if (error) throw error;
  }

  async deleteOrder(orderId: string): Promise<void> {
    await this.supabase.from("external_orders").delete().eq("id", orderId);
  }

  // --- 紐付け ---

  async updateLinkedUser(orderId: string, userId: string | null): Promise<void> {
    const { error } = await this.supabase.from("external_orders").update({ linked_user_id: userId }).eq("id", orderId);
    if (error) throw error;
  }

  async findUserLineUserId(userId: string): Promise<string | null> {
    const { data } = await this.supabase.from("users").select("line_user_id").eq("id", userId).maybeSingle();
    return (data?.line_user_id as string | undefined) ?? null;
  }

  async findLineUserIdForOrder(orderId: string): Promise<string | null> {
    const { data: order } = await this.supabase.from("external_orders").select("linked_user_id").eq("id", orderId).maybeSingle();
    if (!order?.linked_user_id) return null;
    return this.findUserLineUserId(order.linked_user_id as string);
  }

  // --- 区画割当 ---

  async findActiveItemsWithQuantity(orderId: string): Promise<{ id: string; quantity: number }[]> {
    const { data, error } = await this.supabase
      .from("external_order_items")
      .select("id, quantity")
      .eq("order_id", orderId)
      .eq("status", "active");
    if (error) throw error;
    return (data ?? []) as { id: string; quantity: number }[];
  }

  async countAssignedByItemIds(itemIds: string[]): Promise<Map<string, number>> {
    const { data, error } = await this.supabase
      .from("external_order_plot_assignments")
      .select("order_item_id")
      .in("order_item_id", itemIds)
      .eq("status", "assigned");
    if (error) throw error;

    const countByItem = new Map<string, number>();
    for (const a of data ?? []) {
      countByItem.set(a.order_item_id as string, (countByItem.get(a.order_item_id as string) ?? 0) + 1);
    }
    return countByItem;
  }

  async findOrderCastleId(orderId: string): Promise<string | null> {
    const { data, error } = await this.supabase.from("external_orders").select("castle_id").eq("id", orderId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("注文が見つかりません");
    return (data.castle_id as string | null) ?? null;
  }

  async findAvailablePlots(castleId: string | null): Promise<Record<string, unknown>[]> {
    let query = this.supabase.from("castle_plots").select("*").eq("status", "available");
    if (castleId) query = query.eq("castle_id", castleId);
    const { data, error } = await query.order("display_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async findOrderItem(orderItemId: string): Promise<{ id: string; order_id: string; quantity: number } | null> {
    const { data, error } = await this.supabase
      .from("external_order_items")
      .select("id, order_id, quantity")
      .eq("id", orderItemId)
      .maybeSingle();
    if (error) throw error;
    return (data as { id: string; order_id: string; quantity: number } | null) ?? null;
  }

  async countAssignedForItem(orderItemId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("external_order_plot_assignments")
      .select("id", { count: "exact", head: true })
      .eq("order_item_id", orderItemId)
      .eq("status", "assigned");
    if (error) throw error;
    return count ?? 0;
  }

  async insertPlotAssignment(orderItemId: string, plotId: string, assignedBy: string | null): Promise<{ id: string }> {
    const { data, error } = await this.supabase
      .from("external_order_plot_assignments")
      .insert({ order_item_id: orderItemId, plot_id: plotId, assigned_by: assignedBy })
      .select("id")
      .single();
    // plot_idの部分ユニークインデックス違反=7-4の二重割当防止(呼び出し元でcatchしてPlotNotAssignableErrorへ変換)。
    if (error) throw error;
    return data as { id: string };
  }

  async claimPlotReserved(plotId: string, updatedAtIso: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("castle_plots")
      .update({ status: "reserved", updated_at: updatedAtIso })
      .eq("id", plotId)
      .eq("status", "available")
      .select("id");
    if (error) throw error;
    return !!data && data.length > 0;
  }

  async deletePlotAssignment(assignmentId: string): Promise<void> {
    await this.supabase.from("external_order_plot_assignments").delete().eq("id", assignmentId);
  }

  async findAssignment(assignmentId: string): Promise<{ id: string; order_item_id: string; plot_id: string; status: string } | null> {
    const { data, error } = await this.supabase
      .from("external_order_plot_assignments")
      .select("id, order_item_id, plot_id, status")
      .eq("id", assignmentId)
      .maybeSingle();
    if (error) throw error;
    return (data as { id: string; order_item_id: string; plot_id: string; status: string } | null) ?? null;
  }

  async findItemOrderId(orderItemId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("external_order_items")
      .select("order_id")
      .eq("id", orderItemId)
      .maybeSingle();
    if (error) throw error;
    return (data?.order_id as string | undefined) ?? null;
  }

  async cancelAssignment(assignmentId: string, unassignedAtIso: string): Promise<void> {
    const { error } = await this.supabase
      .from("external_order_plot_assignments")
      .update({ status: "cancelled", unassigned_at: unassignedAtIso })
      .eq("id", assignmentId);
    if (error) throw error;
  }

  async releasePlotFromReserved(plotId: string, updatedAtIso: string): Promise<void> {
    const { error } = await this.supabase
      .from("castle_plots")
      .update({ status: "available", updated_at: updatedAtIso })
      .eq("id", plotId)
      .eq("status", "reserved");
    if (error) throw error;
  }

  // --- 区画権利付与 ---

  async findOrderForGrant(orderId: string): Promise<ExternalOrderRow | null> {
    const { data, error } = await this.supabase
      .from("external_orders")
      .select("id, status, linked_user_id, payment_confirmed_at")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    return (data as ExternalOrderRow | null) ?? null;
  }

  async findActiveItemsWithUnitPrice(orderId: string): Promise<{ id: string; quantity: number; unit_price_yen: number }[]> {
    const { data, error } = await this.supabase
      .from("external_order_items")
      .select("id, quantity, unit_price_yen")
      .eq("order_id", orderId)
      .eq("status", "active");
    if (error) throw error;
    return (data ?? []) as { id: string; quantity: number; unit_price_yen: number }[];
  }

  async findAssignedAssignments(itemIds: string[]): Promise<PlotAssignmentRow[]> {
    const { data, error } = await this.supabase
      .from("external_order_plot_assignments")
      .select("id, order_item_id, plot_id, status")
      .in("order_item_id", itemIds)
      .eq("status", "assigned");
    if (error) throw error;
    return (data ?? []) as PlotAssignmentRow[];
  }

  async findPlotStatuses(plotIds: string[]): Promise<{ id: string; status: string }[]> {
    const { data, error } = await this.supabase.from("castle_plots").select("id, status").in("id", plotIds);
    if (error) throw error;
    return (data ?? []) as { id: string; status: string }[];
  }

  async claimPlotSold(
    plotId: string,
    ownerUserId: string,
    soldAtIso: string,
    soldPriceYen: number | null,
    sourceOrderItemId: string
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("castle_plots")
      .update({
        status: "sold",
        owner_user_id: ownerUserId,
        sold_at: soldAtIso,
        sold_price_yen: soldPriceYen,
        source_order_item_id: sourceOrderItemId,
        updated_at: soldAtIso,
      })
      .eq("id", plotId)
      .eq("status", "reserved") // 再試行時に既に確定済みの行を二重更新しないためのガード
      .select("id");
    if (error) throw error;
    return !!data && data.length > 0;
  }

  // --- キャンセル・返金・権利取消 ---

  async findOrderForCancel(orderId: string): Promise<{ id: string; status: ExternalOrderStatus; linked_user_id: string | null } | null> {
    const { data, error } = await this.supabase
      .from("external_orders")
      .select("id, status, linked_user_id")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    return (data as { id: string; status: ExternalOrderStatus; linked_user_id: string | null } | null) ?? null;
  }

  async findAllItemIds(orderId: string): Promise<string[]> {
    const { data, error } = await this.supabase.from("external_order_items").select("id").eq("order_id", orderId);
    if (error) throw error;
    return (data ?? []).map((i) => i.id as string);
  }

  async releasePlotToAvailable(plotId: string, updatedAtIso: string): Promise<void> {
    const { error } = await this.supabase
      .from("castle_plots")
      .update({
        status: "available",
        owner_user_id: null,
        sold_at: null,
        sold_price_yen: null,
        source_order_item_id: null,
        updated_at: updatedAtIso,
      })
      .eq("id", plotId)
      .in("status", ["reserved", "sold"]);
    if (error) throw error;
  }

  async findOrderItemWithStatus(orderItemId: string): Promise<{ id: string; order_id: string; status: string } | null> {
    const { data, error } = await this.supabase
      .from("external_order_items")
      .select("id, order_id, status")
      .eq("id", orderItemId)
      .maybeSingle();
    if (error) throw error;
    return (data as { id: string; order_id: string; status: string } | null) ?? null;
  }

  async findAssignedAssignmentsForItem(orderItemId: string): Promise<{ id: string; plot_id: string }[]> {
    const { data, error } = await this.supabase
      .from("external_order_plot_assignments")
      .select("id, plot_id")
      .eq("order_item_id", orderItemId)
      .eq("status", "assigned");
    if (error) throw error;
    return (data ?? []) as { id: string; plot_id: string }[];
  }

  async markItemCancelled(orderItemId: string): Promise<void> {
    const { error } = await this.supabase.from("external_order_items").update({ status: "cancelled" }).eq("id", orderItemId);
    if (error) throw error;
  }

  async countActiveItems(orderId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("external_order_items")
      .select("id")
      .eq("order_id", orderId)
      .eq("status", "active");
    if (error) throw error;
    return (data ?? []).length;
  }

  // --- 一覧・詳細 ---

  async listOrders(filters: {
    status?: ExternalOrderStatus[];
    castleId?: string;
    unresolvedOnly?: boolean;
    search?: string;
  }): Promise<Record<string, unknown>[]> {
    let query = this.supabase.from("external_orders").select("*, castles:castle_id(name)").order("created_at", { ascending: false });

    if (filters.status && filters.status.length > 0) query = query.in("status", filters.status);
    if (filters.castleId) query = query.eq("castle_id", filters.castleId);
    if (filters.unresolvedOnly) query = query.not("status", "in", "(rights_granted,cancelled,refunded)");
    if (filters.search) {
      const sanitized = filters.search.trim().replace(/[%_]/g, "");
      if (sanitized) query = query.or(`external_order_id.ilike.%${sanitized}%,buyer_name.ilike.%${sanitized}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async findOrderWithCastle(orderId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.supabase
      .from("external_orders")
      .select("*, castles:castle_id(name)")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  async findItemsForDetail(orderId: string): Promise<Record<string, unknown>[]> {
    const { data, error } = await this.supabase
      .from("external_order_items")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async findStatusHistoryForDetail(orderId: string): Promise<Record<string, unknown>[]> {
    const { data, error } = await this.supabase
      .from("external_order_status_histories")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findNotificationsForDetail(orderId: string): Promise<Record<string, unknown>[]> {
    const { data, error } = await this.supabase
      .from("line_notification_logs")
      .select("*")
      .eq("target_type", "external_order")
      .eq("target_id", orderId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findAssignmentsForDetail(itemIds: string[]): Promise<Record<string, unknown>[]> {
    const { data, error } = await this.supabase
      .from("external_order_plot_assignments")
      .select("*, castle_plots:plot_id(plot_code, name, price_yen, status)")
      .in("order_item_id", itemIds)
      .neq("status", "cancelled")
      .order("assigned_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }
}
