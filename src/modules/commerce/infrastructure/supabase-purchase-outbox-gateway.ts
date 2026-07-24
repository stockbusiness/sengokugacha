import { createSupabaseServerClient } from "@/lib/supabase-server";
import { enqueueOutboxEvent, markOutboxFailed, markOutboxSent } from "@/lib/integration-outbox";
import type { OutboxTable, PurchaseOutboxGateway } from "@/modules/commerce/application/ports";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// PurchaseOutboxGatewayのSupabase実装。integration_outbox_events/notification_outbox_events
// テーブル自体はintegrationsモジュールが所有するため、実処理は既存のsrc/lib/integration-outbox.ts
// (バグ修正PR9で導入)へそのまま委譲する薄いアダプタ。integrationsモジュールのPhase B-1対応
// (IntegrationOutboxRepository)が完了したら、こちらをそちらへ差し替える想定。
export class SupabasePurchaseOutboxGateway implements PurchaseOutboxGateway {
  private readonly supabase: SupabaseServerClient;

  constructor(supabase: SupabaseServerClient = createSupabaseServerClient()) {
    this.supabase = supabase;
  }

  async enqueueEvent(
    table: OutboxTable,
    sourceType: string,
    sourceId: string,
    eventType: string,
    targetSystemKey: string,
    payload: Record<string, unknown>
  ): Promise<string> {
    return enqueueOutboxEvent(this.supabase, table, sourceType, sourceId, eventType, targetSystemKey, payload);
  }

  async markSent(table: OutboxTable, id: string): Promise<void> {
    await markOutboxSent(this.supabase, table, id);
  }

  async markFailed(table: OutboxTable, id: string, message: string, previousAttemptCount: number): Promise<void> {
    await markOutboxFailed(this.supabase, table, id, message, previousAttemptCount);
  }
}
