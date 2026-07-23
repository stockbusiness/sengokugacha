import { createSupabaseServerClient } from "@/lib/supabase-server";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

type EntitlementRow = {
  id: string;
};

const ENTITLEMENT_ROW_SELECT = "id";

type ProcessEntitlementGrantResult = {
  claim_outcome: "claimed" | "already_applied" | "already_revoked" | "user_unresolved" | "in_progress" | "dead" | "not_found";
  resolved_user_id: string | null;
};

type ProcessEntitlementRevocationResult = {
  claim_outcome: "claimed" | "already_reversed" | "reversed_without_balance_change" | "in_progress" | "dead" | "not_found";
};

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

  // 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-2(§5.3〜5.5)。
  // process_entitlement_grant()(Postgres関数、マイグレーション20260808000003)が
  // claim検証・user_id再解決・残高加算・application_status更新を単一トランザクションで
  // 実行するため、途中でプロセスが落ちても二重付与は起こらない。
  const { data: grantResultData, error: grantError } = await supabase
    .rpc("process_entitlement_grant", { p_entitlement_row_id: row.id })
    .single();
  if (grantError) throw grantError;
  const grantResult = grantResultData as ProcessEntitlementGrantResult;

  if (grantResult.claim_outcome === "dead") {
    throw new Error(`entitlement付与は再試行の上限に達しています(entitlement_id=${entitlementId})`);
  }
  if (grantResult.claim_outcome === "in_progress") {
    throw new Error(`entitlement付与は他のリクエストが処理中です(entitlement_id=${entitlementId})`);
  }
  if (grantResult.claim_outcome === "user_unresolved") {
    // common_user_idが未解決のユーザーには残高を反映できない。application_statusは
    // not_appliedのまま保持され、後日common_user_id解決が進んだ時点で再送/手動再解決する。
    console.warn(`[entitlements] user_id未解決のため${entitlementType}付与を保留しました(entitlement_id=${entitlementId})`);
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
    .select("id")
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

  // 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-2(§5.3・5.4)。
  // process_entitlement_revocation()(Postgres関数、マイグレーション20260808000003)が
  // claim検証・残高減算・reversal_status更新を単一トランザクションで実行するため、
  // 途中でプロセスが落ちても二重取消は起こらない。statusの更新順序に関わらず、実際に
  // 残高が反映されていた場合のみ取消(減算)を行う(既存挙動を維持)。
  const { data: revokeResultData, error: revokeError } = await supabase
    .rpc("process_entitlement_revocation", { p_entitlement_row_id: entitlement.id })
    .single();
  if (revokeError) throw revokeError;
  const revokeResult = revokeResultData as ProcessEntitlementRevocationResult;

  if (revokeResult.claim_outcome === "dead") {
    throw new Error(`entitlement取消は再試行の上限に達しています(entitlement_id=${entitlementId})`);
  }
  if (revokeResult.claim_outcome === "in_progress") {
    throw new Error(`entitlement取消は他のリクエストが処理中です(entitlement_id=${entitlementId})`);
  }
}
