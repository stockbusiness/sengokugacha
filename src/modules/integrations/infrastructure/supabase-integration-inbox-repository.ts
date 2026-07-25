import crypto from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { IntegrationInboxRepository, InboxClaimResult } from "@/modules/integrations/application/ports";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// IntegrationInboxRepositoryのSupabase実装。claim_integration_inbox_event()
// (Postgres関数、INSERT ON CONFLICT + SELECT FOR UPDATEによる原子的claim)は
// 分割せず、1メソッド呼び出しとして丸ごとラップする(最小リスク方針)。
// claim_token(fencing token)はこのメソッド内で生成し、claim成功時のみ呼び出し元へ返す
// (purchase_grant_steps/entitlements/stripe_webhook_eventsと同じ設計、20260809000007)。
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
    const claimToken = crypto.randomUUID();
    const { data, error } = await this.supabase
      .rpc("claim_integration_inbox_event", {
        p_source_system_key: input.sourceSystemKey,
        p_event_id: input.eventId,
        p_event_type: input.eventType,
        p_payload: input.payload,
        p_payload_hash: input.payloadHash,
        p_event_version: input.eventVersion,
        p_claim_token: claimToken,
      })
      .single();
    if (error) throw error;

    const result = data as { claim_outcome: string; event_row_id: string };
    const inboxEventId = result.event_row_id;

    switch (result.claim_outcome) {
      case "new":
        return { outcome: "new", inboxEventId, claimToken };
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

  async markSucceeded(inboxEventId: string, claimToken: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("mark_integration_inbox_succeeded", {
      p_event_row_id: inboxEventId,
      p_claim_token: claimToken,
    });
    if (error) throw error;
    return data as boolean;
  }

  async markFailed(inboxEventId: string, claimToken: string, message: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("mark_integration_inbox_failed", {
      p_event_row_id: inboxEventId,
      p_claim_token: claimToken,
      p_error: message,
    });
    if (error) throw error;
    return data as boolean;
  }
}
