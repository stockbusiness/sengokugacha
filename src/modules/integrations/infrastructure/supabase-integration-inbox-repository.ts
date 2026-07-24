import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { IntegrationInboxRepository, InboxClaimResult } from "@/modules/integrations/application/ports";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// IntegrationInboxRepositoryのSupabase実装。既存のsrc/lib/integration-inbox.tsに
// 実装されていたRPC呼び出しをそのまま移設したもの。claim_integration_inbox_event()
// (Postgres関数、INSERT ON CONFLICT + SELECT FOR UPDATEによる原子的claim)は
// 分割せず、1メソッド呼び出しとして丸ごとラップする(最小リスク方針)。
export class SupabaseIntegrationInboxRepository implements IntegrationInboxRepository {
  private readonly supabase: SupabaseServerClient;

  constructor(supabase: SupabaseServerClient = createSupabaseServerClient()) {
    this.supabase = supabase;
  }

  async claimEvent(input: {
    sourceSystemKey: string;
    eventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    payloadHash: string;
    eventVersion: string;
  }): Promise<InboxClaimResult> {
    const { data, error } = await this.supabase
      .rpc("claim_integration_inbox_event", {
        p_source_system_key: input.sourceSystemKey,
        p_event_id: input.eventId,
        p_event_type: input.eventType,
        p_payload: input.payload,
        p_payload_hash: input.payloadHash,
        p_event_version: input.eventVersion,
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

  async markSucceeded(inboxEventId: string): Promise<void> {
    await this.supabase
      .from("integration_inbox_events")
      .update({ status: "succeeded", processed_at: new Date().toISOString() })
      .eq("id", inboxEventId);
  }

  async markFailed(inboxEventId: string, message: string): Promise<void> {
    await this.supabase.from("integration_inbox_events").update({ status: "failed", last_error: message }).eq("id", inboxEventId);
  }
}
