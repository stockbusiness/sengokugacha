import { SupabaseExternalOrderRepository } from "@/modules/commerce/infrastructure/supabase-external-order-repository";
import type { ExternalOrderStatus } from "@/lib/external-order-state";
import {
  transitionExternalOrder as transitionExternalOrderApp,
  submitExternalOrder as submitExternalOrderApp,
  confirmPayment as confirmPaymentApp,
  ExternalOrderPermissionError,
  type AdminRole,
} from "@/modules/commerce/application/external-order-transitions";
import {
  createExternalOrder as createExternalOrderApp,
  type CreateExternalOrderInput,
  type ExternalOrderItemInput,
} from "@/modules/commerce/application/external-order-registration";
import {
  linkUserToOrder as linkUserToOrderApp,
  unlinkUserFromOrder as unlinkUserFromOrderApp,
} from "@/modules/commerce/application/external-order-linking";
import {
  getAssignablePlots as getAssignablePlotsApp,
  assignPlotToOrderItem as assignPlotToOrderItemApp,
  unassignPlotFromOrderItem as unassignPlotFromOrderItemApp,
  PlotNotAssignableError,
  computeOrderAssignmentStatus,
  type AssignmentProgress,
} from "@/modules/commerce/application/external-order-plot-assignment";
import {
  grantExternalOrderRights as grantExternalOrderRightsApp,
  type GrantRightsResult,
} from "@/modules/commerce/application/external-order-rights";
import {
  cancelExternalOrder as cancelExternalOrderApp,
  cancelExternalOrderItem as cancelExternalOrderItemApp,
  type CancelResolution,
} from "@/modules/commerce/application/external-order-cancellation";
import {
  listExternalOrders as listExternalOrdersApp,
  getExternalOrderDetail as getExternalOrderDetailApp,
  type ExternalOrderListFilters,
} from "@/modules/commerce/application/external-order-queries";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase B-1(commerceモジュール、PR4)。
// 実装本体はsrc/modules/commerce/へ移設した(application層: external-order-*.ts、
// infrastructure層: supabase-external-order-repository.ts)。既存のimport経路
// (@/lib/external-orders)を変更せずに使い続けられるよう、本ファイルは薄い互換ラッパーとして残す。
// 挙動・クエリ・エラーメッセージは移設前と完全に同一(コードの再配置のみ)。
//
// notifyExternalOrderEvent()(@/lib/external-order-notifications)はSupabaseクライアントの
// 受け渡しを呼び出し元に要求しない設計のため、castle-notifications.ts等と同様、application層
// から直接呼び出す既存の協調モジュールとして扱い、本PRの対象には含めていない。

export { ExternalOrderPermissionError, PlotNotAssignableError, computeOrderAssignmentStatus, type AssignmentProgress };
export type { AdminRole, CreateExternalOrderInput, ExternalOrderItemInput, GrantRightsResult, CancelResolution, ExternalOrderListFilters };

export async function transitionExternalOrder(
  orderId: string,
  toStatus: ExternalOrderStatus,
  actorName: string | null,
  role: AdminRole,
  reason?: string | null
): Promise<void> {
  await transitionExternalOrderApp(new SupabaseExternalOrderRepository(), orderId, toStatus, actorName, role, reason);
}

export async function submitExternalOrder(orderId: string, actorName: string | null) {
  await submitExternalOrderApp(new SupabaseExternalOrderRepository(), orderId, actorName);
}

export async function confirmPayment(orderId: string, actorName: string | null) {
  await confirmPaymentApp(new SupabaseExternalOrderRepository(), orderId, actorName);
}

export async function createExternalOrder(input: CreateExternalOrderInput, actorName: string | null) {
  return createExternalOrderApp(new SupabaseExternalOrderRepository(), input, actorName);
}

export async function linkUserToOrder(orderId: string, userId: string, actorName: string | null) {
  await linkUserToOrderApp(new SupabaseExternalOrderRepository(), orderId, userId, actorName);
}

export async function unlinkUserFromOrder(orderId: string, actorName: string | null, reason: string | null, role: AdminRole) {
  await unlinkUserFromOrderApp(new SupabaseExternalOrderRepository(), orderId, actorName, reason, role);
}

export async function getAssignablePlots(orderId: string) {
  return getAssignablePlotsApp(new SupabaseExternalOrderRepository(), orderId);
}

export async function assignPlotToOrderItem(orderItemId: string, plotId: string, actorName: string | null) {
  await assignPlotToOrderItemApp(new SupabaseExternalOrderRepository(), orderItemId, plotId, actorName);
}

export async function unassignPlotFromOrderItem(assignmentId: string, actorName: string | null) {
  await unassignPlotFromOrderItemApp(new SupabaseExternalOrderRepository(), assignmentId, actorName);
}

export async function grantExternalOrderRights(orderId: string, actorName: string | null): Promise<GrantRightsResult> {
  return grantExternalOrderRightsApp(new SupabaseExternalOrderRepository(), orderId, actorName);
}

export async function cancelExternalOrder(orderId: string, resolution: CancelResolution, reason: string, actorName: string | null) {
  await cancelExternalOrderApp(new SupabaseExternalOrderRepository(), orderId, resolution, reason, actorName);
}

export async function cancelExternalOrderItem(
  orderItemId: string,
  resolution: CancelResolution,
  reason: string,
  actorName: string | null
) {
  await cancelExternalOrderItemApp(new SupabaseExternalOrderRepository(), orderItemId, resolution, reason, actorName);
}

export async function listExternalOrders(filters: ExternalOrderListFilters = {}) {
  return listExternalOrdersApp(new SupabaseExternalOrderRepository(), filters);
}

export async function getExternalOrderDetail(orderId: string) {
  return getExternalOrderDetailApp(new SupabaseExternalOrderRepository(), orderId);
}
