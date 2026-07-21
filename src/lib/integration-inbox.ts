import crypto from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート 全体統合対応 実装計画(PR5)。
// 00_COMMON_INTEGRATION_CONTRACT.md 6.4章の冪等性ルールをintegration_inbox_eventsで実装する。
// 権利付与API・購入/返金イベント受信(PR6/PR7)から共通で使う想定。

export function computePayloadHash(rawBody: string): string {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

export type InboxClaimResult =
  | { outcome: "new"; inboxEventId: string }
  | { outcome: "duplicate" } // 同一event_id・同一payload_hashが処理済み。再実行不要。
  | { outcome: "conflict" }; // 同一event_idで本文ハッシュが異なる。契約書6.4により409を返す。

// event_id単位の冪等性を担保する。'new'の場合のみ呼び出し元が実処理を行い、完了後に
// markInboxEventSucceeded/Failedを呼ぶこと。pending/processing/failedのまま残っている行は
// 再実行対象として扱う(前回の処理が完了していないため)。
export async function claimInboxEvent(input: {
  sourceSystemKey: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  payloadHash: string;
}): Promise<InboxClaimResult> {
  const supabase = createSupabaseServerClient();

  const { data: existing, error: fetchError } = await supabase
    .from("integration_inbox_events")
    .select("id, status, payload_hash, attempt_count")
    .eq("source_system_key", input.sourceSystemKey)
    .eq("event_id", input.eventId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (existing) {
    if (existing.payload_hash !== input.payloadHash) {
      return { outcome: "conflict" };
    }
    if (existing.status === "succeeded") {
      return { outcome: "duplicate" };
    }
    await supabase
      .from("integration_inbox_events")
      .update({ status: "processing", attempt_count: (existing.attempt_count ?? 0) + 1 })
      .eq("id", existing.id);
    return { outcome: "new", inboxEventId: existing.id as string };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("integration_inbox_events")
    .insert({
      source_system_key: input.sourceSystemKey,
      event_id: input.eventId,
      event_type: input.eventType,
      payload: input.payload,
      payload_hash: input.payloadHash,
      status: "processing",
      attempt_count: 1,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  return { outcome: "new", inboxEventId: inserted.id as string };
}

export async function markInboxEventSucceeded(inboxEventId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase
    .from("integration_inbox_events")
    .update({ status: "succeeded", processed_at: new Date().toISOString() })
    .eq("id", inboxEventId);
}

export async function markInboxEventFailed(inboxEventId: string, message: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.from("integration_inbox_events").update({ status: "failed", last_error: message }).eq("id", inboxEventId);
}
