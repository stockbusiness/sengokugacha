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

type EntitlementRow = {
  id: string;
  status: string;
  application_status: string;
  application_attempt_count: number;
  user_id: string | null;
  entitlement_type: string;
  quantity: number;
};

const ENTITLEMENT_ROW_SELECT = "id, status, application_status, application_attempt_count, user_id, entitlement_type, quantity";

async function resolveLocalUserId(supabase: SupabaseServerClient, commonUserId: string): Promise<string | null> {
  const { data, error } = await supabase.from("users").select("id").eq("common_user_id", commonUserId).maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

// 千ノ国パスポート次期改修指示書 P0-2(§4.4)。entitlement.revokedがentitlement.grantedより
// 先に届いていた場合、grant確定直後にその取消を適用する(順序逆転対応)。
async function applyPendingRevocationIfAny(supabase: SupabaseServerClient, systemKey: string, entitlementId: string): Promise<void> {
  const { data: pending, error } = await supabase
    .from("entitlement_pending_revocations")
    .select("id, payload")
    .eq("source_system_key", systemKey)
    .eq("entitlement_id", entitlementId)
    .maybeSingle();
  if (error) throw error;
  if (!pending) return;

  await handleEntitlementRevoked(pending.payload as Record<string, unknown>, systemKey);
  await supabase.from("entitlement_pending_revocations").delete().eq("id", pending.id as string);
}

// P0-2(§4.3)。entitlement_id自体は記録済みでも残高反映(application_status)が
// 'applied'でなければ再試行する(既存実装ではentitlement_id重複時に即returnしていたため、
// 残高反映が一度も成功しないまま再送を受けても永久に復旧できないバグ#3があった)。
// entitlement_idの一意性はsource_system_key単位(§6.2)。source_system_keyはHMAC認証済みの
// identity.systemKeyを正とし、未検証のリクエスト本文(body.source_system_key)は使わない(バグ#6)。
export async function handleEntitlementGranted(body: Record<string, unknown>, systemKey: string): Promise<void> {
  const entitlementId = typeof body.entitlement_id === "string" ? body.entitlement_id : null;
  const commonUserId = typeof body.common_user_id === "string" ? body.common_user_id : null;
  const entitlementType = typeof body.entitlement_type === "string" ? body.entitlement_type : "generic";
  if (!entitlementId || !commonUserId) {
    throw new Error("entitlement_id/common_user_idが不足しています");
  }

  const supabase = createSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("entitlements")
    .select(ENTITLEMENT_ROW_SELECT)
    .eq("source_system_key", systemKey)
    .eq("entitlement_id", entitlementId)
    .maybeSingle();
  if (existingError) throw existingError;

  let row: EntitlementRow;

  if (existing) {
    row = existing as EntitlementRow;
  } else {
    const userId = await resolveLocalUserId(supabase, commonUserId);
    const quantity = typeof body.quantity === "number" && body.quantity > 0 ? body.quantity : 1;

    const { data: inserted, error: insertError } = await supabase
      .from("entitlements")
      .insert({
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
        source_system_key: systemKey,
        metadata: body.metadata ?? null,
      })
      .select(ENTITLEMENT_ROW_SELECT)
      .single();
    if (insertError) {
      if (insertError.code !== "23505") throw insertError;
      // 並行実行との競合。相手が既に作成済みのため取得し直す。
      const { data: raced, error: racedError } = await supabase
        .from("entitlements")
        .select(ENTITLEMENT_ROW_SELECT)
        .eq("source_system_key", systemKey)
        .eq("entitlement_id", entitlementId)
        .single();
      if (racedError) throw racedError;
      row = raced as EntitlementRow;
    } else {
      row = inserted as EntitlementRow;
    }
  }

  // 既にrevoked化されている(=取消が先に処理済み)場合、残高への再付与は行わない。
  // application_status未適用のまま取消された(残高未反映のまま台帳上だけ取消済み)ケースを
  // 再送で誤って付与してしまうことを防ぐ。
  if (row.application_status !== "applied" && row.status !== "revoked") {
    const balanceColumn = BALANCE_ENTITLEMENT_COLUMNS[row.entitlement_type];
    if (balanceColumn && row.user_id) {
      try {
        await adjustUserBalance(row.user_id, balanceColumn, row.quantity);
      } catch (applyError) {
        const message = applyError instanceof Error ? applyError.message : "unknown error";
        await supabase
          .from("entitlements")
          .update({
            application_status: "failed",
            application_last_error: message,
            application_attempt_count: (row.application_attempt_count ?? 0) + 1,
          })
          .eq("id", row.id);
        throw applyError;
      }
      await supabase
        .from("entitlements")
        .update({ application_status: "applied", balance_applied_at: new Date().toISOString() })
        .eq("id", row.id);
    } else if (balanceColumn && !row.user_id) {
      // common_user_idが未解決のユーザーには残高を反映できない。application_statusは
      // not_appliedのまま保持し、後日common_user_id解決が進んだ時点で再送/手動反映する。
      console.warn(`[entitlements] user_id未解決のため${row.entitlement_type}付与を保留しました(entitlement_id=${entitlementId})`);
    } else {
      // 残高への実効果を持たない種別(パスポート会員権・城区画等)。台帳記録のみで完了扱いとする。
      await supabase
        .from("entitlements")
        .update({ application_status: "applied", balance_applied_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  await applyPendingRevocationIfAny(supabase, systemKey, entitlementId);
}

export async function handleEntitlementUpdated(body: Record<string, unknown>, systemKey: string): Promise<void> {
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
    .eq("source_system_key", systemKey)
    .eq("entitlement_id", entitlementId);
  if (error) throw error;
}

// P0-2(§4.3・4.4)。statusの更新順序に関わらず、実際に残高が反映されていた場合のみ
// 取消(減算)を行う(既存実装ではstatus='revoked'を先に更新していたため、減算が失敗すると
// 冪等チェック(status==='revoked')に阻まれ再試行できなくなるバグ#4があった)。
// 対象のentitlementがまだ存在しない場合(grantより先にrevokeが届いた順序逆転)は、
// 保留取消として保存し、grant到着時に適用する。
export async function handleEntitlementRevoked(body: Record<string, unknown>, systemKey: string): Promise<void> {
  const entitlementId = typeof body.entitlement_id === "string" ? body.entitlement_id : null;
  if (!entitlementId) throw new Error("entitlement_idが不足しています");

  const supabase = createSupabaseServerClient();
  const { data: entitlement, error: fetchError } = await supabase
    .from("entitlements")
    .select("id, status, application_status, reversal_status, reversal_attempt_count, user_id, entitlement_type, quantity")
    .eq("source_system_key", systemKey)
    .eq("entitlement_id", entitlementId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (!entitlement) {
    const { error: upsertError } = await supabase
      .from("entitlement_pending_revocations")
      .upsert(
        { source_system_key: systemKey, entitlement_id: entitlementId, payload: body },
        { onConflict: "source_system_key,entitlement_id" }
      );
    if (upsertError) throw upsertError;
    return;
  }

  if (entitlement.reversal_status === "reversed") return; // 冪等。

  if (entitlement.status !== "revoked") {
    const { error: statusUpdateError } = await supabase
      .from("entitlements")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", entitlement.id);
    if (statusUpdateError) throw statusUpdateError;
  }

  const balanceColumn = BALANCE_ENTITLEMENT_COLUMNS[entitlement.entitlement_type as string];
  if (balanceColumn && entitlement.user_id && entitlement.application_status === "applied") {
    try {
      await adjustUserBalance(entitlement.user_id as string, balanceColumn, -(entitlement.quantity as number));
    } catch (reverseError) {
      const message = reverseError instanceof Error ? reverseError.message : "unknown error";
      await supabase
        .from("entitlements")
        .update({
          reversal_status: "failed",
          reversal_last_error: message,
          reversal_attempt_count: (entitlement.reversal_attempt_count ?? 0) + 1,
        })
        .eq("id", entitlement.id);
      throw reverseError;
    }
  }

  const { error: reversalUpdateError } = await supabase
    .from("entitlements")
    .update({ reversal_status: "reversed", balance_reversed_at: new Date().toISOString() })
    .eq("id", entitlement.id);
  if (reversalUpdateError) throw reversalUpdateError;
}
