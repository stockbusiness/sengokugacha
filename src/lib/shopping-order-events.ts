import { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート 全体統合対応 実装計画(PR7)。P0-2(§6.1)でsource_system_key単位の
// 冪等性に変更。
// 購入・決済・返金イベントの受信・記録。商品カタログ・注文ID体系がまだ確定していない
// ため、当面は監査目的の記録のみとし、権利・残高への反映はentitlement.granted/revoked
// (PR6)を介した場合に限定する。
export async function recordShoppingOrderEvent(
  eventId: string,
  eventType: string,
  body: Record<string, unknown>,
  systemKey: string,
  eventVersion: string
): Promise<void> {
  const supabase = createSupabaseServerClient();

  const commonUserId = typeof body.common_user_id === "string" ? body.common_user_id : null;
  let userId: string | null = null;
  if (commonUserId) {
    const { data, error } = await supabase.from("users").select("id").eq("common_user_id", commonUserId).maybeSingle();
    if (error) throw error;
    userId = (data?.id as string | undefined) ?? null;
  }

  const { error: insertError } = await supabase.from("shopping_order_events").insert({
    event_id: eventId,
    event_type: eventType,
    source_system_key: systemKey,
    event_version: eventVersion,
    order_id: typeof body.order_id === "string" ? body.order_id : null,
    order_item_id: typeof body.order_item_id === "string" ? body.order_item_id : null,
    common_user_id: commonUserId,
    user_id: userId,
    agency_id: typeof body.agency_id === "string" ? body.agency_id : null,
    sales_agent_id: typeof body.sales_agent_id === "string" ? body.sales_agent_id : null,
    closing_agent_id: typeof body.closing_agent_id === "string" ? body.closing_agent_id : null,
    amount: typeof body.amount === "number" ? body.amount : null,
    payload: body,
  });
  if (insertError) {
    if (insertError.code === "23505") return; // 同一source_system_key+event_idは記録済み(冪等)。
    throw insertError;
  }
}
