import { NextRequest, NextResponse } from "next/server";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import {
  createExternalOrder,
  listExternalOrders,
  type CreateExternalOrderInput,
  type ExternalOrderListFilters,
} from "@/lib/external-orders";
import { EXTERNAL_ORDER_STATUSES, type ExternalOrderStatus } from "@/lib/external-order-state";

function isExternalOrderStatus(value: unknown): value is ExternalOrderStatus {
  return typeof value === "string" && (EXTERNAL_ORDER_STATUSES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const statusParam = params.getAll("status").filter(isExternalOrderStatus);
  const filters: ExternalOrderListFilters = {
    status: statusParam.length > 0 ? statusParam : undefined,
    castleId: params.get("castle_id") || undefined,
    unresolvedOnly: params.get("unresolved_only") === "1",
    search: params.get("search") || undefined,
  };

  try {
    const orders = await listExternalOrders(filters);
    return NextResponse.json(orders);
  } catch (error) {
    const message = error instanceof Error ? error.message : "一覧の取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .map((item: Record<string, unknown>) => ({
      externalProductId: typeof item.external_product_id === "string" ? item.external_product_id : null,
      productName: typeof item.product_name === "string" ? item.product_name : "",
      quantity: Number.isFinite(item.quantity) ? Number(item.quantity) : 0,
      unitPriceYen: Number.isFinite(item.unit_price_yen) ? Number(item.unit_price_yen) : 0,
    }))
    .filter((item: { productName: string; quantity: number }) => item.productName && item.quantity > 0);

  if (typeof body.external_shop_name !== "string" || !body.external_shop_name.trim()) {
    return NextResponse.json({ error: "external_shop_name は必須です" }, { status: 400 });
  }
  if (typeof body.external_order_id !== "string" || !body.external_order_id.trim()) {
    return NextResponse.json({ error: "external_order_id は必須です" }, { status: 400 });
  }
  if (typeof body.buyer_name !== "string" || !body.buyer_name.trim()) {
    return NextResponse.json({ error: "buyer_name は必須です" }, { status: 400 });
  }
  if (!Number.isFinite(body.amount_yen)) {
    return NextResponse.json({ error: "amount_yen は必須です" }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "注文明細を1件以上指定してください" }, { status: 400 });
  }

  const input: CreateExternalOrderInput = {
    externalShopName: body.external_shop_name,
    externalOrderId: body.external_order_id,
    amountYen: Number(body.amount_yen),
    currency: typeof body.currency === "string" ? body.currency : undefined,
    buyerName: body.buyer_name,
    buyerNameKana: typeof body.buyer_name_kana === "string" ? body.buyer_name_kana : null,
    buyerEmail: typeof body.buyer_email === "string" ? body.buyer_email : null,
    buyerPhone: typeof body.buyer_phone === "string" ? body.buyer_phone : null,
    externalCustomerId: typeof body.external_customer_id === "string" ? body.external_customer_id : null,
    externalAgentId: typeof body.external_agent_id === "string" ? body.external_agent_id : null,
    agentNameSnapshot: typeof body.agent_name_snapshot === "string" ? body.agent_name_snapshot : null,
    agentSalesRepSnapshot: typeof body.agent_sales_rep_snapshot === "string" ? body.agent_sales_rep_snapshot : null,
    referralUrlOrCode: typeof body.referral_url_or_code === "string" ? body.referral_url_or_code : null,
    castleId: typeof body.castle_id === "string" ? body.castle_id : null,
    adminMemo: typeof body.admin_memo === "string" ? body.admin_memo : null,
    items,
  };

  try {
    const order = await createExternalOrder(input, await getAdminActorName());
    return NextResponse.json(order);
  } catch (error) {
    // external_shop_name + external_order_id のユニーク制約違反(5-3の重複登録防止)。
    const message = error instanceof Error ? error.message : "登録に失敗しました";
    const isDuplicate = message.includes("duplicate key") || message.includes("unique");
    return NextResponse.json(
      { error: isDuplicate ? "同一ショップ・同一注文IDの注文がすでに登録されています" : message },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}
