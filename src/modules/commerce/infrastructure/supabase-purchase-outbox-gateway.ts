import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SupabaseIntegrationOutboxRepository } from "@/modules/integrations/infrastructure/supabase-integration-outbox-repository";
import type { OutboxTable, PurchaseOutboxGateway } from "@/modules/commerce/application/ports";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// PurchaseOutboxGatewayのSupabase実装。integration_outbox_events/notification_outbox_events
// テーブル自体はintegrationsモジュールが所有するため、実処理はintegrationsモジュールの
// Phase B-1対応で導入したIntegrationOutboxRepositoryへ委譲する(旧: src/lib/integration-outbox.ts
// の関数を直接呼んでいたが、integrationsモジュールのPhase B-1完了に伴いこちらへ差し替えた)。
export class SupabasePurchaseOutboxGateway implements PurchaseOutboxGateway {
  private readonly repository: SupabaseIntegrationOutboxRepository;

  constructor(supabase: SupabaseServerClient = createSupabaseServerClient()) {
    this.repository = new SupabaseIntegrationOutboxRepository(supabase);
  }

  async enqueueEvent(
    table: OutboxTable,
    sourceType: string,
    sourceId: string,
    eventType: string,
    targetSystemKey: string,
    payload: Record<string, unknown>
  ): Promise<string> {
    return this.repository.enqueueEvent(table, sourceType, sourceId, eventType, targetSystemKey, payload);
  }

  async markSent(table: OutboxTable, id: string): Promise<void> {
    await this.repository.markSent(table, id);
  }

  async markFailed(table: OutboxTable, id: string, message: string, previousAttemptCount: number): Promise<void> {
    await this.repository.markFailed(table, id, message, previousAttemptCount);
  }
}
