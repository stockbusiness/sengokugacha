import crypto from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート 全体統合対応 実装計画(PR5)。P0-2(§4.5)で原子的claimに変更。
// 00_COMMON_INTEGRATION_CONTRACT.md 6.4章の冪等性ルールをintegration_inbox_eventsで実装する。
// 権利付与API・購入/返金イベント受信(PR6/PR7)から共通で使う想定。

export function computePayloadHash(rawBody: string): string {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

export type InboxClaimResult =
  | { outcome: "new"; inboxEventId: string }
  | { outcome: "duplicate"; inboxEventId: string } // 同一event_id・同一payload_hashが処理済み。再実行不要。
  | { outcome: "conflict"; inboxEventId: string } // 同一event_idで本文ハッシュが異なる。契約書6.4により409を返す。
  | { outcome: "in_progress"; inboxEventId: string } // 他のリクエストが現在処理中。並行実行を避けるため今回は処理しない。
  | { outcome: "dead"; inboxEventId: string }; // 再試行の上限に達し処理断念済み(管理画面からの確認が必要)。

// event_id単位の冪等性を担保する。claim_integration_inbox_event() (Postgres関数、
// マイグレーション20260807000004)でINSERT ON CONFLICT + SELECT FOR UPDATEによる
// 原子的claimを行うため、同一event_idへの並行リクエストのうち1件だけが"new"を得て
// 実処理を行う(P0-2で指摘されたバグ#5の修正: 従来はSELECT-then-UPDATEで
// WHERE句ガードが無く、並行リクエストが両方とも"new"になり得た)。
// "new"の場合のみ呼び出し元が実処理を行い、完了後にmarkInboxEventSucceeded/Failedを呼ぶこと。
export async function claimInboxEvent(input: {
  sourceSystemKey: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  payloadHash: string;
}): Promise<InboxClaimResult> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .rpc("claim_integration_inbox_event", {
      p_source_system_key: input.sourceSystemKey,
      p_event_id: input.eventId,
      p_event_type: input.eventType,
      p_payload: input.payload,
      p_payload_hash: input.payloadHash,
    })
    .single();
  if (error) throw error;

  const result = data as { claim_outcome: string; event_row_id: string };
  const inboxEventId = result.event_row_id;

  switch (result.claim_outcome) {
    case "new":
      return { outcome: "new", inboxEventId };
    case "duplicate":
      return { outcome: "duplicate", inboxEventId };
    case "conflict":
      return { outcome: "conflict", inboxEventId };
    case "in_progress":
      return { outcome: "in_progress", inboxEventId };
    case "dead":
      return { outcome: "dead", inboxEventId };
    default:
      throw new Error(`unexpected claim_outcome: ${result.claim_outcome}`);
  }
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
