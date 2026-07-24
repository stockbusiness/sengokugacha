import { logAdminAction } from "@/lib/admin-audit-log";
import { notifyExternalOrderEvent } from "@/lib/external-order-notifications";
import { transitionExternalOrder, type AdminRole } from "@/modules/commerce/application/external-order-transitions";
import type { ExternalOrderRepository } from "@/modules/commerce/application/external-order-ports";

// ============================================================
// 購入者とLINEユーザーの紐付け(6章)。
// ============================================================

// 検索は既存の/api/admin/users?q=をそのまま流用する(usersテーブルには
// LINE表示名/line_user_idしか無く、この既存エンドポイントの検索条件と完全に
// 一致するため、専用の検索処理は重複実装になる。現状監査9章の通り、
// メール・電話番号・会員番号でのマッチングはusersテーブルにその列自体が
// 存在せず実現できない)。

export async function linkUserToOrder(
  repository: ExternalOrderRepository,
  orderId: string,
  userId: string,
  actorName: string | null
) {
  await repository.updateLinkedUser(orderId, userId);
  await transitionExternalOrder(repository, orderId, "plot_assignment_pending", actorName, "manager");

  await logAdminAction(actorName, "external_order_link_user", undefined, {
    targetType: "external_order",
    targetId: orderId,
    after: { linkedUserId: userId },
  });

  const lineUserId = await repository.findUserLineUserId(userId);
  await notifyExternalOrderEvent(orderId, lineUserId, "user_link_requested");
}

// 6-4「権利付与前は担当者が解除可能」。遷移マトリクス側でrights_granted以降からの
// user_link_pendingへの遷移を許可していないため、権利付与後は自動的にエラーになる。
export async function unlinkUserFromOrder(
  repository: ExternalOrderRepository,
  orderId: string,
  actorName: string | null,
  reason: string | null,
  role: AdminRole
) {
  const order = await repository.findOrderForTransition(orderId);
  if (!order) throw new Error("注文が見つかりません");

  await transitionExternalOrder(repository, orderId, "user_link_pending", actorName, role, reason);
  await repository.updateLinkedUser(orderId, null);
}
