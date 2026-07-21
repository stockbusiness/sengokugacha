import { createSupabaseServerClient } from "@/lib/supabase-server";
import { adjustUserBalance } from "@/lib/atomic-balance";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// 千ノ国パスポート 全体統合対応 実装計画(PR6)。
// entitlement_typeのうち、既存の残高カラムへ実効果を持たせられるもの(kokudaka/
// gacha_ticket)。それ以外(パスポート会員権・城区画等)は商品カタログが未確定のため、
// entitlementsへの台帳記録のみとし、残高・権利への反映は行わない(fallback-safe)。
const BALANCE_ENTITLEMENT_COLUMNS: Record<string, "kokudaka" | "gacha_tickets"> = {
  kokudaka: "kokudaka",
  gacha_ticket: "gacha_tickets",
};

async function resolveLocalUserId(supabase: SupabaseServerClient, commonUserId: string): Promise<string | null> {
  const { data, error } = await supabase.from("users").select("id").eq("common_user_id", commonUserId).maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

export async function handleEntitlementGranted(body: Record<string, unknown>): Promise<void> {
  const entitlementId = typeof body.entitlement_id === "string" ? body.entitlement_id : null;
  const commonUserId = typeof body.common_user_id === "string" ? body.common_user_id : null;
  const entitlementType = typeof body.entitlement_type === "string" ? body.entitlement_type : "generic";
  if (!entitlementId || !commonUserId) {
    throw new Error("entitlement_id/common_user_idが不足しています");
  }

  const supabase = createSupabaseServerClient();

  // entitlement_id自体の重複付与防止(inbox側のevent_id冪等性とは別の防御層)。
  const { data: existing, error: existingError } = await supabase
    .from("entitlements")
    .select("id")
    .eq("entitlement_id", entitlementId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;

  const userId = await resolveLocalUserId(supabase, commonUserId);
  const quantity = typeof body.quantity === "number" && body.quantity > 0 ? body.quantity : 1;

  const { error: insertError } = await supabase.from("entitlements").insert({
    entitlement_id: entitlementId,
    common_user_id: commonUserId,
    user_id: userId,
    entitlement_type: entitlementType,
    product_code: typeof body.product_code === "string" ? body.product_code : null,
    status: "granted",
    quantity,
    valid_from: typeof body.valid_from === "string" ? body.valid_from : null,
    valid_until: typeof body.valid_until === "string" ? body.valid_until : null,
    order_id: typeof body.order_id === "string" ? body.order_id : null,
    order_item_id: typeof body.order_item_id === "string" ? body.order_item_id : null,
    source_system_key: typeof body.source_system_key === "string" ? body.source_system_key : "unknown",
    metadata: body.metadata ?? null,
  });
  if (insertError) {
    if (insertError.code === "23505") return; // 競合したリクエストが先に処理済み(冪等)。
    throw insertError;
  }

  const balanceColumn = BALANCE_ENTITLEMENT_COLUMNS[entitlementType];
  if (balanceColumn && userId) {
    await adjustUserBalance(userId, balanceColumn, quantity);
  } else if (balanceColumn && !userId) {
    // common_user_idが未解決のユーザーには残高を反映できない。台帳には記録済みのため、
    // 後日common_user_id解決が進んだ時点で手動反映する運用とする。
    console.warn(`[entitlements] user_id未解決のためkokudaka/gacha_ticket付与を保留しました(entitlement_id=${entitlementId})`);
  }
}

export async function handleEntitlementUpdated(body: Record<string, unknown>): Promise<void> {
  const entitlementId = typeof body.entitlement_id === "string" ? body.entitlement_id : null;
  if (!entitlementId) throw new Error("entitlement_idが不足しています");

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("entitlements")
    .update({
      valid_from: typeof body.valid_from === "string" ? body.valid_from : undefined,
      valid_until: typeof body.valid_until === "string" ? body.valid_until : undefined,
      metadata: body.metadata ?? undefined,
    })
    .eq("entitlement_id", entitlementId);
  if (error) throw error;
}

export async function handleEntitlementRevoked(body: Record<string, unknown>): Promise<void> {
  const entitlementId = typeof body.entitlement_id === "string" ? body.entitlement_id : null;
  if (!entitlementId) throw new Error("entitlement_idが不足しています");

  const supabase = createSupabaseServerClient();
  const { data: entitlement, error: fetchError } = await supabase
    .from("entitlements")
    .select("id, status, user_id, entitlement_type, quantity")
    .eq("entitlement_id", entitlementId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!entitlement) return; // 対象が無い(grantedが先に届いていない等)。
  if (entitlement.status === "revoked") return; // 冪等。

  const { error: updateError } = await supabase
    .from("entitlements")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", entitlement.id);
  if (updateError) throw updateError;

  const balanceColumn = BALANCE_ENTITLEMENT_COLUMNS[entitlement.entitlement_type as string];
  if (balanceColumn && entitlement.user_id) {
    await adjustUserBalance(entitlement.user_id as string, balanceColumn, -(entitlement.quantity as number));
  }
}
