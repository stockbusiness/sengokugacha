import { logAdminAction } from "@/lib/admin-audit-log";
import type { ExternalOrderRepository, ExternalOrderRow } from "@/modules/commerce/application/external-order-ports";

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

export async function createExternalOrder(
  repository: ExternalOrderRepository,
  input: CreateExternalOrderInput,
  actorName: string | null
): Promise<ExternalOrderRow> {
  if (input.items.length === 0) throw new Error("注文明細を1件以上指定してください");

  // external_shop_name + external_order_id のユニーク制約違反=5-3の重複登録防止
  // (insertOrder()内でDBのunique制約違反がそのままエラーとして伝播する)。
  const order = await repository.insertOrder({
    externalShopName: input.externalShopName,
    externalOrderId: input.externalOrderId,
    amountYen: input.amountYen,
    currency: input.currency ?? "JPY",
    buyerName: input.buyerName,
    buyerNameKana: input.buyerNameKana ?? null,
    buyerEmail: input.buyerEmail ?? null,
    buyerPhone: input.buyerPhone ?? null,
    externalCustomerId: input.externalCustomerId ?? null,
    externalAgentId: input.externalAgentId ?? null,
    agentNameSnapshot: input.agentNameSnapshot ?? null,
    agentSalesRepSnapshot: input.agentSalesRepSnapshot ?? null,
    referralUrlOrCode: input.referralUrlOrCode ?? null,
    castleId: input.castleId ?? null,
    adminMemo: input.adminMemo ?? null,
    registeredBy: actorName,
  });

  try {
    await repository.insertOrderItems(
      order.id,
      input.items.map((item) => ({
        externalProductId: item.externalProductId ?? null,
        productName: item.productName,
        quantity: item.quantity,
        unitPriceYen: item.unitPriceYen,
        subtotalYen: item.quantity * item.unitPriceYen,
      }))
    );
  } catch (itemsError) {
    // トランザクションが無いため、明細insertに失敗したら注文本体を補償削除する。
    await repository.deleteOrder(order.id);
    throw itemsError;
  }

  await logAdminAction(actorName, "external_order_create", `${input.externalShopName}/${input.externalOrderId}`, {
    targetType: "external_order",
    targetId: order.id,
    after: order,
  });

  return order;
}
