import { createSupabaseServerClient } from "@/lib/supabase-server";
import type {
  IntegrationOutboxRepository,
  OutboxDrainClaimOutcome,
  OutboxRow,
  OutboxTable,
} from "@/modules/integrations/application/ports";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// IntegrationOutboxRepositoryのSupabase実装。既存のsrc/lib/integration-outbox.ts
// (バグ修正PR9)に実装されていたクエリをそのまま移設したもの。
export class SupabaseIntegrationOutboxRepository implements IntegrationOutboxRepository {
  private readonly supabase: SupabaseServerClient;

  constructor(supabase: SupabaseServerClient = createSupabaseServerClient()) {
    this.supabase = supabase;
  }

  // 既に同じ組み合わせ(source_type, source_id, event_type, target_system_key)で登録済みの
  // 場合は既存行のidを返す(冪等)。呼び出し元は再実行時に重複行を作らずに済む。
  async enqueueEvent(
    table: OutboxTable,
    sourceType: string,
    sourceId: string,
    eventType: string,
    targetSystemKey: string,
    payload: Record<string, unknown>
  ): Promise<string> {
    const { data: inserted, error: insertError } = await this.supabase
      .from(table)
      .insert({ source_type: sourceType, source_id: sourceId, event_type: eventType, target_system_key: targetSystemKey, payload })
      .select("id")
      .single();
    if (!insertError) return inserted.id as string;

    if (insertError.code !== "23505") throw insertError;
    const { data: existing, error: fetchError } = await this.supabase
      .from(table)
      .select("id")
      .eq("source_type", sourceType)
      .eq("source_id", sourceId)
      .eq("event_type", eventType)
      .eq("target_system_key", targetSystemKey)
      .single();
    if (fetchError) throw fetchError;
    return existing.id as string;
  }

  async markSent(table: OutboxTable, id: string): Promise<void> {
    const { error } = await this.supabase.from(table).update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  }

  async markFailed(table: OutboxTable, id: string, message: string, previousAttemptCount: number): Promise<void> {
    const { error } = await this.supabase
      .from(table)
      .update({ status: "failed", last_error: message, attempt_count: previousAttemptCount + 1 })
      .eq("id", id);
    if (error) throw error;
  }

  async listPendingOrFailed(table: OutboxTable): Promise<OutboxRow[]> {
    const { data, error } = await this.supabase
      .from(table)
      .select("id, source_type, source_id, event_type, target_system_key, payload, status, attempt_count, last_error, created_at, sent_at")
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as OutboxRow[];
  }

  private claimRpcName(table: OutboxTable): string {
    return table === "integration_outbox_events" ? "claim_integration_outbox_event" : "claim_notification_outbox_event";
  }

  private sentRpcName(table: OutboxTable): string {
    return table === "integration_outbox_events" ? "mark_integration_outbox_sent" : "mark_notification_outbox_sent";
  }

  private failedRpcName(table: OutboxTable): string {
    return table === "integration_outbox_events" ? "mark_integration_outbox_failed" : "mark_notification_outbox_failed";
  }

  async claimForDrain(table: OutboxTable, id: string, claimToken: string): Promise<OutboxDrainClaimOutcome> {
    const { data, error } = await this.supabase.rpc(this.claimRpcName(table), { p_id: id, p_claim_token: claimToken });
    if (error) throw error;
    return data as OutboxDrainClaimOutcome;
  }

  async markDrainSent(table: OutboxTable, id: string, claimToken: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc(this.sentRpcName(table), { p_id: id, p_claim_token: claimToken });
    if (error) throw error;
    return data as boolean;
  }

  async markDrainFailed(table: OutboxTable, id: string, claimToken: string, message: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc(this.failedRpcName(table), {
      p_id: id,
      p_claim_token: claimToken,
      p_error: message,
    });
    if (error) throw error;
    return data as boolean;
  }
}
