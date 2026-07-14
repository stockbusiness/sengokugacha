import { logAdminAction } from "@/lib/admin-audit-log";
import { notifyExternalOrderEvent } from "@/lib/external-order-notifications";
import {
  canOperatorPerformOrderTransition,
  isValidExternalOrderTransition,
  InvalidExternalOrderTransitionError,
  type ExternalOrderStatus,
} from "@/lib/external-order-state";
import { createSupabaseServerClient } from "@/lib/supabase-server";

async function getLineUserIdForOrder(orderId: string): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { data: order } = await supabase.from("external_orders").select("linked_user_id").eq("id", orderId).maybeSingle();
  if (!order?.linked_user_id) return null;
  const { data: user } = await supabase.from("users").select("line_user_id").eq("id", order.linked_user_id).maybeSingle();
  return (user?.line_user_id as string | undefined) ?? null;
}

export type AdminRole = "operator" | "manager";

export class ExternalOrderPermissionError extends Error {
  constructor() {
    super("この操作は本部管理者のみ実行できます");
    this.name = "ExternalOrderPermissionError";
  }
}

export class PlotNotAssignableError extends Error {
  constructor() {
    super("この区画は現在割り当てできません(すでに他の注文へ割り当て済み、または販売可能状態ではありません)");
    this.name = "PlotNotAssignableError";
  }
}

// ============================================================
// 注文状態遷移(castle-lord-contracts.tsのtransitionContract()と同じパターン)。
// ============================================================

export async function transitionExternalOrder(
  orderId: string,
  toStatus: ExternalOrderStatus,
  actorName: string | null,
  role: AdminRole,
  reason?: string | null
): Promise<void> {
  const supabase = createSupabaseServerClient();

  const { data: current, error: fetchError } = await supabase
    .from("external_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!current) throw new Error("注文が見つかりません");

  const fromStatus = current.status as ExternalOrderStatus;
  if (!isValidExternalOrderTransition(fromStatus, toStatus)) {
    throw new InvalidExternalOrderTransitionError(fromStatus, toStatus);
  }
  if (role !== "manager" && !canOperatorPerformOrderTransition(fromStatus, toStatus)) {
    throw new ExternalOrderPermissionError();
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("external_orders")
    .update({ status: toStatus, updated_at: nowIso })
    .eq("id", orderId);
  if (updateError) throw updateError;

  const { error: historyError } = await supabase.from("external_order_status_histories").insert({
    order_id: orderId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: actorName,
    reason: reason ?? null,
    snapshot_before: current,
  });
  if (historyError) throw historyError;

  await logAdminAction(actorName, "external_order_transition", `${fromStatus} -> ${toStatus}`, {
    targetType: "external_order",
    targetId: orderId,
    before: { status: fromStatus },
    after: { status: toStatus },
  });
}

// draft状態の注文を、情報登録完了として入金待ちへ進める(operator可)。
export async function submitExternalOrder(orderId: string, actorName: string | null) {
  await transitionExternalOrder(orderId, "payment_pending", actorName, "operator");
}

// 入金確認確定(11章、manager限定)。payment_confirmed_atを記録した上で、
// 紐付け待ちまで一気に進める(実装計画7章「紐付け未確定の間、自動でこの状態を経由」)。
export async function confirmPayment(orderId: string, actorName: string | null) {
  const supabase = createSupabaseServerClient();

  await transitionExternalOrder(orderId, "payment_confirmed", actorName, "manager");

  const { error } = await supabase
    .from("external_orders")
    .update({ payment_confirmed_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) throw error;

  await transitionExternalOrder(orderId, "user_link_pending", actorName, "manager");
}

// ============================================================
// 注文登録
// ============================================================

export type ExternalOrderItemInput = {
  externalProductId?: string | null;
  productName: string;
  quantity: number;
  unitPriceYen: number;
};

export type CreateExternalOrderInput = {
  externalShopName: string;
  externalOrderId: string;
  amountYen: number;
  currency?: string;
  buyerName: string;
  buyerNameKana?: string | null;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  externalCustomerId?: string | null;
  externalAgentId?: string | null;
  agentNameSnapshot?: string | null;
  agentSalesRepSnapshot?: string | null;
  referralUrlOrCode?: string | null;
  castleId?: string | null;
  adminMemo?: string | null;
  items: ExternalOrderItemInput[];
};

export async function createExternalOrder(input: CreateExternalOrderInput, actorName: string | null) {
  if (input.items.length === 0) throw new Error("注文明細を1件以上指定してください");

  const supabase = createSupabaseServerClient();

  const { data: order, error: orderError } = await supabase
    .from("external_orders")
    .insert({
      external_shop_name: input.externalShopName,
      external_order_id: input.externalOrderId,
      amount_yen: input.amountYen,
      currency: input.currency ?? "JPY",
      buyer_name: input.buyerName,
      buyer_name_kana: input.buyerNameKana ?? null,
      buyer_email: input.buyerEmail ?? null,
      buyer_phone: input.buyerPhone ?? null,
      external_customer_id: input.externalCustomerId ?? null,
      external_agent_id: input.externalAgentId ?? null,
      agent_name_snapshot: input.agentNameSnapshot ?? null,
      agent_sales_rep_snapshot: input.agentSalesRepSnapshot ?? null,
      referral_url_or_code: input.referralUrlOrCode ?? null,
      castle_id: input.castleId ?? null,
      admin_memo: input.adminMemo ?? null,
      registered_by: actorName,
    })
    .select("*")
    .single();
  // external_shop_name + external_order_id のユニーク制約違反=5-3の重複登録防止。
  if (orderError) throw orderError;

  const { error: itemsError } = await supabase.from("external_order_items").insert(
    input.items.map((item) => ({
      order_id: order.id,
      external_product_id: item.externalProductId ?? null,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price_yen: item.unitPriceYen,
      subtotal_yen: item.quantity * item.unitPriceYen,
    }))
  );
  if (itemsError) {
    // トランザクションが無いため、明細insertに失敗したら注文本体を補償削除する。
    await supabase.from("external_orders").delete().eq("id", order.id);
    throw itemsError;
  }

  await logAdminAction(actorName, "external_order_create", `${input.externalShopName}/${input.externalOrderId}`, {
    targetType: "external_order",
    targetId: order.id as string,
    after: order,
  });

  return order;
}

// ============================================================
// 購入者とLINEユーザーの紐付け(6章)。
// ============================================================

// 検索は既存の/api/admin/users?q=をそのまま流用する(usersテーブルには
// LINE表示名/line_user_idしか無く、この既存エンドポイントの検索条件と完全に
// 一致するため、専用の検索処理は重複実装になる。現状監査9章の通り、
// メール・電話番号・会員番号でのマッチングはusersテーブルにその列自体が
// 存在せず実現できない)。

export async function linkUserToOrder(orderId: string, userId: string, actorName: string | null) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("external_orders").update({ linked_user_id: userId }).eq("id", orderId);
  if (error) throw error;

  await transitionExternalOrder(orderId, "plot_assignment_pending", actorName, "manager");

  await logAdminAction(actorName, "external_order_link_user", undefined, {
    targetType: "external_order",
    targetId: orderId,
    after: { linkedUserId: userId },
  });

  const { data: user } = await supabase.from("users").select("line_user_id").eq("id", userId).maybeSingle();
  await notifyExternalOrderEvent(orderId, (user?.line_user_id as string | undefined) ?? null, "user_link_requested");
}

// 6-4「権利付与前は担当者が解除可能」。遷移マトリクス側でrights_granted以降からの
// user_link_pendingへの遷移を許可していないため、権利付与後は自動的にエラーになる。
export async function unlinkUserFromOrder(
  orderId: string,
  actorName: string | null,
  reason: string | null,
  role: AdminRole
) {
  const supabase = createSupabaseServerClient();

  const { data: order, error: fetchError } = await supabase
    .from("external_orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!order) throw new Error("注文が見つかりません");

  await transitionExternalOrder(orderId, "user_link_pending", actorName, role, reason);

  const { error: clearError } = await supabase
    .from("external_orders")
    .update({ linked_user_id: null })
    .eq("id", orderId);
  if (clearError) throw clearError;
}

// ============================================================
// 区画割当(7章)。
// ============================================================

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

async function getItemsWithAssignedCounts(orderId: string) {
  const supabase = createSupabaseServerClient();
  // 一部取消(9-4)でcancelledになった明細は、割当状況の集計・権利付与の対象から除外する。
  const { data: items, error: itemsError } = await supabase
    .from("external_order_items")
    .select("id, quantity")
    .eq("order_id", orderId)
    .eq("status", "active");
  if (itemsError) throw itemsError;

  const itemIds = (items ?? []).map((i) => i.id as string);
  const { data: assignments, error: assignmentsError } = itemIds.length
    ? await supabase
        .from("external_order_plot_assignments")
        .select("order_item_id")
        .in("order_item_id", itemIds)
        .eq("status", "assigned")
    : { data: [] as { order_item_id: string }[], error: null };
  if (assignmentsError) throw assignmentsError;

  const countByItem = new Map<string, number>();
  for (const a of assignments ?? []) {
    countByItem.set(a.order_item_id as string, (countByItem.get(a.order_item_id as string) ?? 0) + 1);
  }

  return (items ?? []).map((item) => ({
    id: item.id as string,
    quantity: item.quantity as number,
    assignedCount: countByItem.get(item.id as string) ?? 0,
  }));
}

async function recomputeAndTransition(orderId: string, actorName: string | null, role: AdminRole) {
  const items = await getItemsWithAssignedCounts(orderId);
  const nextStatus = computeOrderAssignmentStatus(items);

  const supabase = createSupabaseServerClient();
  const { data: order, error } = await supabase.from("external_orders").select("status").eq("id", orderId).maybeSingle();
  if (error) throw error;
  if (!order) throw new Error("注文が見つかりません");

  if (order.status !== nextStatus) {
    await transitionExternalOrder(orderId, nextStatus as ExternalOrderStatus, actorName, role);
    // 個々の区画割当ごとに通知すると煩雑なため、全区画の割当が揃った時点(ready_to_grant到達時)
    // のみ「区画割当完了」を通知する。
    if (nextStatus === "ready_to_grant") {
      const lineUserId = await getLineUserIdForOrder(orderId);
      await notifyExternalOrderEvent(orderId, lineUserId, "plot_assigned");
    }
  }
}

export async function getAssignablePlots(orderId: string) {
  const supabase = createSupabaseServerClient();
  const { data: order, error: orderError } = await supabase
    .from("external_orders")
    .select("castle_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new Error("注文が見つかりません");

  let query = supabase.from("castle_plots").select("*").eq("status", "available");
  if (order.castle_id) query = query.eq("castle_id", order.castle_id);
  const { data, error } = await query.order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function assignPlotToOrderItem(orderItemId: string, plotId: string, actorName: string | null) {
  const supabase = createSupabaseServerClient();

  const { data: item, error: itemError } = await supabase
    .from("external_order_items")
    .select("id, order_id, quantity")
    .eq("id", orderItemId)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) throw new Error("注文明細が見つかりません");

  const { count: assignedCount, error: countError } = await supabase
    .from("external_order_plot_assignments")
    .select("id", { count: "exact", head: true })
    .eq("order_item_id", orderItemId)
    .eq("status", "assigned");
  if (countError) throw countError;
  if ((assignedCount ?? 0) >= (item.quantity as number)) {
    throw new Error("この注文明細はすでに必要数の区画が割り当て済みです");
  }

  const { data: assignment, error: insertError } = await supabase
    .from("external_order_plot_assignments")
    .insert({ order_item_id: orderItemId, plot_id: plotId, assigned_by: actorName })
    .select("id")
    .single();
  // plot_idの部分ユニークインデックス違反=7-4の二重割当防止。
  if (insertError) throw new PlotNotAssignableError();

  const nowIso = new Date().toISOString();
  const { data: updatedPlots, error: plotError } = await supabase
    .from("castle_plots")
    .update({ status: "reserved", updated_at: nowIso })
    .eq("id", plotId)
    .eq("status", "available")
    .select("id");
  if (plotError) throw plotError;
  if (!updatedPlots || updatedPlots.length === 0) {
    // 区画がすでにavailableではなかった(競合)。割当を補償ロールバックする。
    await supabase.from("external_order_plot_assignments").delete().eq("id", assignment.id);
    throw new PlotNotAssignableError();
  }

  await recomputeAndTransition(item.order_id as string, actorName, "operator");

  await logAdminAction(actorName, "external_order_assign_plot", `plot_id=${plotId}`, {
    targetType: "external_order",
    targetId: item.order_id as string,
    after: { orderItemId, plotId },
  });
}

export async function unassignPlotFromOrderItem(assignmentId: string, actorName: string | null) {
  const supabase = createSupabaseServerClient();

  const { data: assignment, error: fetchError } = await supabase
    .from("external_order_plot_assignments")
    .select("id, order_item_id, plot_id, status")
    .eq("id", assignmentId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!assignment) throw new Error("区画割当が見つかりません");
  if (assignment.status !== "assigned") throw new Error("この区画割当はすでに解除済みです");

  const { data: item, error: itemError } = await supabase
    .from("external_order_items")
    .select("order_id")
    .eq("id", assignment.order_item_id)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) throw new Error("注文明細が見つかりません");

  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("external_order_plot_assignments")
    .update({ status: "cancelled", unassigned_at: nowIso })
    .eq("id", assignmentId);
  if (updateError) throw updateError;

  const { error: plotError } = await supabase
    .from("castle_plots")
    .update({ status: "available", updated_at: nowIso })
    .eq("id", assignment.plot_id)
    .eq("status", "reserved");
  if (plotError) throw plotError;

  await recomputeAndTransition(item.order_id as string, actorName, "operator");

  await logAdminAction(actorName, "external_order_unassign_plot", `plot_id=${assignment.plot_id}`, {
    targetType: "external_order",
    targetId: item.order_id as string,
    before: { orderItemId: assignment.order_item_id, plotId: assignment.plot_id },
  });
}

// ============================================================
// 区画権利付与(8章)。DBトランザクションが本リポジトリに存在しないため
// (現状監査14項目め参照)、事前条件チェックをすべて先に行った上で、各区画更新は
// 「まだ確定していない行だけを対象にする」ガード付きupdateにして再試行安全にする。
// ============================================================

export type GrantRightsResult = { orderId: string; grantedPlotIds: string[]; linkedUserId: string };

export async function grantExternalOrderRights(orderId: string, actorName: string | null): Promise<GrantRightsResult> {
  const supabase = createSupabaseServerClient();

  const { data: order, error: orderError } = await supabase
    .from("external_orders")
    .select("id, status, linked_user_id, payment_confirmed_at")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new Error("注文が見つかりません");
  if (order.status !== "ready_to_grant") {
    throw new Error("権利付与は「権利付与準備完了」状態の注文のみ実行できます");
  }
  if (!order.payment_confirmed_at) throw new Error("入金確認が完了していません");
  if (!order.linked_user_id) throw new Error("購入者とLINEユーザーの紐付けが完了していません");

  // 一部取消(9-4)でcancelledになった明細は対象外にする。
  const { data: items, error: itemsError } = await supabase
    .from("external_order_items")
    .select("id, quantity, unit_price_yen")
    .eq("order_id", orderId)
    .eq("status", "active");
  if (itemsError) throw itemsError;

  const itemIds = (items ?? []).map((i) => i.id as string);
  const { data: assignments, error: assignmentsError } = itemIds.length
    ? await supabase
        .from("external_order_plot_assignments")
        .select("id, order_item_id, plot_id, status")
        .in("order_item_id", itemIds)
        .eq("status", "assigned")
    : { data: [] as { id: string; order_item_id: string; plot_id: string; status: string }[], error: null };
  if (assignmentsError) throw assignmentsError;

  const unitPriceByItem = new Map((items ?? []).map((i) => [i.id as string, i.unit_price_yen as number]));
  const assignedCountByItem = new Map<string, number>();
  for (const a of assignments ?? []) {
    assignedCountByItem.set(a.order_item_id as string, (assignedCountByItem.get(a.order_item_id as string) ?? 0) + 1);
  }
  const fullyAssigned = (items ?? []).every(
    (item) => (assignedCountByItem.get(item.id as string) ?? 0) >= (item.quantity as number)
  );
  if (!fullyAssigned) throw new Error("すべての注文明細に必要数の区画が割り当てられていません");

  const plotIds = (assignments ?? []).map((a) => a.plot_id as string);
  const { data: plots, error: plotsError } = plotIds.length
    ? await supabase.from("castle_plots").select("id, status").in("id", plotIds)
    : { data: [], error: null };
  if (plotsError) throw plotsError;
  const staleSold = (plots ?? []).filter((p) => p.status !== "reserved");
  if (staleSold.length > 0) {
    throw new Error("割当済み区画の一部がすでに販売済み・変更されています。区画割当をご確認ください");
  }

  const nowIso = new Date().toISOString();
  const grantedPlotIds: string[] = [];
  for (const assignment of assignments ?? []) {
    const unitPriceYen = unitPriceByItem.get(assignment.order_item_id as string) ?? null;
    const { data: updated, error: updateError } = await supabase
      .from("castle_plots")
      .update({
        status: "sold",
        owner_user_id: order.linked_user_id,
        sold_at: nowIso,
        sold_price_yen: unitPriceYen,
        source_order_item_id: assignment.order_item_id,
        updated_at: nowIso,
      })
      .eq("id", assignment.plot_id)
      .eq("status", "reserved") // 再試行時に既に確定済みの行を二重更新しないためのガード
      .select("id");
    if (updateError) throw updateError;
    if (updated && updated.length > 0) grantedPlotIds.push(assignment.plot_id as string);
  }

  await transitionExternalOrder(orderId, "rights_granted", actorName, "manager");

  await logAdminAction(actorName, "external_order_grant_rights", `plots=${grantedPlotIds.join(",")}`, {
    targetType: "external_order",
    targetId: orderId,
    after: { linkedUserId: order.linked_user_id, grantedPlotIds },
  });

  const lineUserId = await getLineUserIdForOrder(orderId);
  await notifyExternalOrderEvent(orderId, lineUserId, "rights_granted");

  return { orderId, grantedPlotIds, linkedUserId: order.linked_user_id as string };
}

// ============================================================
// キャンセル・返金・権利取消(9章)。
// ============================================================

export type CancelResolution = "cancelled" | "refunded";

// 外部ショップで返金・取消が完了した後の手動反映(9-1)。戦国パスポートから外部ショップの
// 返金処理自体は行わない。有効な区画割当・権利をすべて取り消し、区画を再販売可能へ戻す。
export async function cancelExternalOrder(
  orderId: string,
  resolution: CancelResolution,
  reason: string,
  actorName: string | null
) {
  const supabase = createSupabaseServerClient();

  const { data: order, error: orderError } = await supabase
    .from("external_orders")
    .select("id, status, linked_user_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new Error("注文が見つかりません");

  if (order.status !== "cancel_pending") {
    await transitionExternalOrder(orderId, "cancel_pending", actorName, "manager", reason);
  }

  const { data: items, error: itemsError } = await supabase.from("external_order_items").select("id").eq("order_id", orderId);
  if (itemsError) throw itemsError;
  const itemIds = (items ?? []).map((i) => i.id as string);

  const { data: assignments, error: assignmentsError } = itemIds.length
    ? await supabase
        .from("external_order_plot_assignments")
        .select("id, plot_id")
        .in("order_item_id", itemIds)
        .eq("status", "assigned")
    : { data: [] as { id: string; plot_id: string }[], error: null };
  if (assignmentsError) throw assignmentsError;

  const nowIso = new Date().toISOString();
  for (const assignment of assignments ?? []) {
    const { error: unassignError } = await supabase
      .from("external_order_plot_assignments")
      .update({ status: "cancelled", unassigned_at: nowIso })
      .eq("id", assignment.id);
    if (unassignError) throw unassignError;

    // 割当のみ(reserved)・権利付与済み(sold)のどちらであっても再販売可能へ戻し、
    // 所有者情報をクリアする(9-2「区画を再販売可能へ変更」「/my-landの状態を更新」)。
    const { error: plotError } = await supabase
      .from("castle_plots")
      .update({
        status: "available",
        owner_user_id: null,
        sold_at: null,
        sold_price_yen: null,
        source_order_item_id: null,
        updated_at: nowIso,
      })
      .eq("id", assignment.plot_id)
      .in("status", ["reserved", "sold"]);
    if (plotError) throw plotError;
  }

  await transitionExternalOrder(orderId, resolution, actorName, "manager", reason);

  await logAdminAction(actorName, "external_order_cancel", `resolution=${resolution} reason=${reason}`, {
    targetType: "external_order",
    targetId: orderId,
    after: { resolution, reason },
  });

  if (order.linked_user_id) {
    const { data: user } = await supabase.from("users").select("line_user_id").eq("id", order.linked_user_id).maybeSingle();
    const lineUserId = (user?.line_user_id as string | undefined) ?? null;
    await notifyExternalOrderEvent(orderId, lineUserId, resolution === "refunded" ? "refund_applied" : "rights_revoked");
  }
}

// 一部取消(9-4「複数区画注文の一部のみ取消できる設計とする」)。特定の注文明細
// (=区画1件分)のみを取消し、他の明細・注文全体の状態には影響させない。
// この明細に紐づく有効な区画割当・区画権利(割当のみ/権利付与済みどちらも)を
// 取り消し、区画を再販売可能へ戻す。全明細が取消済みになった場合のみ、
// 注文全体もcancelExternalOrder()と同じ経路でcancel_pending→resolutionへ進める。
export async function cancelExternalOrderItem(
  orderItemId: string,
  resolution: CancelResolution,
  reason: string,
  actorName: string | null
) {
  const supabase = createSupabaseServerClient();

  const { data: item, error: itemError } = await supabase
    .from("external_order_items")
    .select("id, order_id, status")
    .eq("id", orderItemId)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) throw new Error("注文明細が見つかりません");
  if (item.status === "cancelled") throw new Error("この注文明細はすでに取消済みです");

  const { data: assignments, error: assignmentsError } = await supabase
    .from("external_order_plot_assignments")
    .select("id, plot_id")
    .eq("order_item_id", orderItemId)
    .eq("status", "assigned");
  if (assignmentsError) throw assignmentsError;

  const nowIso = new Date().toISOString();
  for (const assignment of assignments ?? []) {
    const { error: unassignError } = await supabase
      .from("external_order_plot_assignments")
      .update({ status: "cancelled", unassigned_at: nowIso })
      .eq("id", assignment.id);
    if (unassignError) throw unassignError;

    const { error: plotError } = await supabase
      .from("castle_plots")
      .update({
        status: "available",
        owner_user_id: null,
        sold_at: null,
        sold_price_yen: null,
        source_order_item_id: null,
        updated_at: nowIso,
      })
      .eq("id", assignment.plot_id)
      .in("status", ["reserved", "sold"]);
    if (plotError) throw plotError;
  }

  const { error: itemUpdateError } = await supabase
    .from("external_order_items")
    .update({ status: "cancelled" })
    .eq("id", orderItemId);
  if (itemUpdateError) throw itemUpdateError;

  await logAdminAction(actorName, "external_order_item_cancel", `order_item_id=${orderItemId} reason=${reason}`, {
    targetType: "external_order_item",
    targetId: orderItemId,
    after: { reason },
  });

  // 全明細が取消済みになっていたら、注文全体もキャンセル/返金として確定する
  // (この場合はcancelExternalOrder()側が全体向けの通知を送るため、ここでの
  // plot_changed通知は重複を避けて送らない)。
  const { data: remainingItems, error: remainingError } = await supabase
    .from("external_order_items")
    .select("id")
    .eq("order_id", item.order_id)
    .eq("status", "active");
  if (remainingError) throw remainingError;

  if ((remainingItems ?? []).length === 0) {
    await cancelExternalOrder(item.order_id as string, resolution, reason, actorName);
  } else {
    const lineUserId = await getLineUserIdForOrder(item.order_id as string);
    await notifyExternalOrderEvent(item.order_id as string, lineUserId, "plot_changed");
  }
}

// ============================================================
// 一覧・詳細(4章)。
// ============================================================

export type ExternalOrderListFilters = {
  status?: ExternalOrderStatus[];
  castleId?: string;
  unresolvedOnly?: boolean; // ユーザー未紐付け or 権利未付与のもの(4-12「未処理案件」相当)
  search?: string; // 外部注文ID・購入者氏名
};

export async function listExternalOrders(filters: ExternalOrderListFilters = {}) {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("external_orders")
    .select("*, castles:castle_id(name)")
    .order("created_at", { ascending: false });

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

export async function getExternalOrderDetail(orderId: string) {
  const supabase = createSupabaseServerClient();

  const [
    { data: order, error: orderError },
    { data: items, error: itemsError },
    { data: history, error: historyError },
    { data: notifications, error: notificationsError },
  ] = await Promise.all([
    supabase.from("external_orders").select("*, castles:castle_id(name)").eq("id", orderId).maybeSingle(),
    supabase.from("external_order_items").select("*").eq("order_id", orderId).order("created_at", { ascending: true }),
    supabase
      .from("external_order_status_histories")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    supabase
      .from("line_notification_logs")
      .select("*")
      .eq("target_type", "external_order")
      .eq("target_id", orderId)
      .order("created_at", { ascending: false }),
  ]);
  if (orderError) throw orderError;
  if (itemsError) throw itemsError;
  if (historyError) throw historyError;
  if (notificationsError) throw notificationsError;
  if (!order) return null;

  const itemIds = (items ?? []).map((i) => i.id as string);
  const { data: assignments, error: assignmentsError } = itemIds.length
    ? await supabase
        .from("external_order_plot_assignments")
        .select("*, castle_plots:plot_id(plot_code, name, price_yen, status)")
        .in("order_item_id", itemIds)
        .neq("status", "cancelled")
        .order("assigned_at", { ascending: true })
    : { data: [], error: null };
  if (assignmentsError) throw assignmentsError;

  const assignmentsByItem = new Map<string, typeof assignments>();
  for (const a of assignments ?? []) {
    const list = assignmentsByItem.get(a.order_item_id as string) ?? [];
    list.push(a);
    assignmentsByItem.set(a.order_item_id as string, list);
  }

  return {
    order,
    items: (items ?? []).map((item) => ({
      ...item,
      assignments: assignmentsByItem.get(item.id as string) ?? [],
    })),
    history: history ?? [],
    notifications: notifications ?? [],
  };
}
