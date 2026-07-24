import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SupabaseIntegrationOutboxRepository } from "@/modules/integrations/infrastructure/supabase-integration-outbox-repository";
import type { OutboxRow, OutboxTable } from "@/modules/integrations/application/ports";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase B-1(integrationsモジュール)。
// 実装本体はsrc/modules/integrations/infrastructure/supabase-integration-outbox-repository.ts
// へ移設した。既存のimport経路(@/lib/integration-outbox)・関数シグネチャ(supabaseクライアントを
// 呼び出し元から受け取る形)を変更せずに使い続けられるよう、本ファイルは薄い互換ラッパーとして残す。

export type { OutboxTable, OutboxRow };

export async function enqueueOutboxEvent(
  supabase: SupabaseServerClient,
  table: OutboxTable,
  sourceType: string,
  sourceId: string,
  eventType: string,
  targetSystemKey: string,
  payload: Record<string, unknown>
): Promise<string> {
  return new SupabaseIntegrationOutboxRepository(supabase).enqueueEvent(table, sourceType, sourceId, eventType, targetSystemKey, payload);
}

export async function markOutboxSent(supabase: SupabaseServerClient, table: OutboxTable, id: string): Promise<void> {
  await new SupabaseIntegrationOutboxRepository(supabase).markSent(table, id);
}

export async function markOutboxFailed(
  supabase: SupabaseServerClient,
  table: OutboxTable,
  id: string,
  message: string,
  previousAttemptCount: number
): Promise<void> {
  await new SupabaseIntegrationOutboxRepository(supabase).markFailed(table, id, message, previousAttemptCount);
}

export async function listPendingOrFailedOutboxEvents(supabase: SupabaseServerClient, table: OutboxTable): Promise<OutboxRow[]> {
  return new SupabaseIntegrationOutboxRepository(supabase).listPendingOrFailed(table);
}
