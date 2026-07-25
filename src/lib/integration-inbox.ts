import crypto from "node:crypto";
import { SupabaseIntegrationInboxRepository } from "@/modules/integrations/infrastructure/supabase-integration-inbox-repository";
import type { InboxClaimResult } from "@/modules/integrations/application/ports";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase B-1(integrationsモジュール)。
// 実装本体はsrc/modules/integrations/infrastructure/supabase-integration-inbox-repository.ts
// へ移設した。既存のimport経路(@/lib/integration-inbox)を変更せずに使い続けられるよう、
// 本ファイルは薄い互換ラッパーとして残す。computePayloadHash()はDB非依存の純粋関数のため
// そのまま維持する。

export function computePayloadHash(rawBody: string): string {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

export type { InboxClaimResult };

export async function claimInboxEvent(input: {
  sourceSystemKey: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  eventVersion: string;
}): Promise<InboxClaimResult> {
  return new SupabaseIntegrationInboxRepository().claimEvent(input);
}

export async function markInboxEventSucceeded(inboxEventId: string, claimToken: string): Promise<void> {
  const ok = await new SupabaseIntegrationInboxRepository().markSucceeded(inboxEventId, claimToken);
  if (!ok) {
    console.error(`integration_inbox_events(${inboxEventId})の完了記録がclaim_token不一致で失敗しました(横取りされた可能性)`);
  }
}

export async function markInboxEventFailed(inboxEventId: string, claimToken: string, message: string): Promise<void> {
  const ok = await new SupabaseIntegrationInboxRepository().markFailed(inboxEventId, claimToken, message);
  if (!ok) {
    console.error(`integration_inbox_events(${inboxEventId})の失敗記録がclaim_token不一致で失敗しました(横取りされた可能性)`);
  }
}
