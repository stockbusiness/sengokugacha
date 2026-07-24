import { logAdminAction } from "@/lib/admin-audit-log";
import {
  canOperatorPerformOrderTransition,
  isValidExternalOrderTransition,
  InvalidExternalOrderTransitionError,
  type ExternalOrderStatus,
} from "@/lib/external-order-state";
import type { ExternalOrderRepository } from "@/modules/commerce/application/external-order-ports";

export type AdminRole = "operator" | "manager";

export class ExternalOrderPermissionError extends Error {
  constructor() {
    super("この操作は本部管理者のみ実行できます");
    this.name = "ExternalOrderPermissionError";
  }
}

// ============================================================
// 注文状態遷移(castle-lord-contracts.tsのtransitionContract()と同じパターン)。
// ============================================================

export async function transitionExternalOrder(
  repository: ExternalOrderRepository,
  orderId: string,
  toStatus: ExternalOrderStatus,
  actorName: string | null,
  role: AdminRole,
  reason?: string | null
): Promise<void> {
  const current = await repository.findOrderForTransition(orderId);
  if (!current) throw new Error("注文が見つかりません");

  const fromStatus = current.status;
  if (!isValidExternalOrderTransition(fromStatus, toStatus)) {
    throw new InvalidExternalOrderTransitionError(fromStatus, toStatus);
  }
  if (role !== "manager" && !canOperatorPerformOrderTransition(fromStatus, toStatus)) {
    throw new ExternalOrderPermissionError();
  }

  const nowIso = new Date().toISOString();
  await repository.updateOrderStatus(orderId, toStatus, nowIso);
  await repository.insertStatusHistory(orderId, fromStatus, toStatus, actorName, reason ?? null, current);

  await logAdminAction(actorName, "external_order_transition", `${fromStatus} -> ${toStatus}`, {
    targetType: "external_order",
    targetId: orderId,
    before: { status: fromStatus },
    after: { status: toStatus },
  });
}

// draft状態の注文を、情報登録完了として入金待ちへ進める(operator可)。
export async function submitExternalOrder(repository: ExternalOrderRepository, orderId: string, actorName: string | null) {
  await transitionExternalOrder(repository, orderId, "payment_pending", actorName, "operator");
}

// 入金確認確定(11章、manager限定)。payment_confirmed_atを記録した上で、
// 紐付け待ちまで一気に進める(実装計画7章「紐付け未確定の間、自動でこの状態を経由」)。
export async function confirmPayment(repository: ExternalOrderRepository, orderId: string, actorName: string | null) {
  await transitionExternalOrder(repository, orderId, "payment_confirmed", actorName, "manager");
  await repository.updatePaymentConfirmedAt(orderId, new Date().toISOString());
  await transitionExternalOrder(repository, orderId, "user_link_pending", actorName, "manager");
}
