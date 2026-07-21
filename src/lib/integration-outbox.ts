import { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート 全体統合対応 実装計画(PR5)。
// 他システムへHMAC署名付きでイベントを送る場合の送達記録+再送管理の基盤。
// PR5時点では実際の送信先(呼び出し元)は無く、テーブルとCRUD関数のみを用意する。

export async function enqueueOutboxEvent(eventType: string, targetSystemKey: string, payload: Record<string, unknown>): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("integration_outbox_events")
    .insert({ event_type: eventType, target_system_key: targetSystemKey, payload, status: "pending" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function markOutboxEventSent(outboxEventId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase
    .from("integration_outbox_events")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", outboxEventId);
}

export async function markOutboxEventFailed(outboxEventId: string, message: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("integration_outbox_events")
    .select("attempt_count")
    .eq("id", outboxEventId)
    .maybeSingle();
  await supabase
    .from("integration_outbox_events")
    .update({ status: "failed", last_error: message, attempt_count: (existing?.attempt_count ?? 0) + 1 })
    .eq("id", outboxEventId);
}
