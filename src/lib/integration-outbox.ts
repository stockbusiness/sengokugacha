import { createSupabaseServerClient } from "@/lib/supabase-server";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 §4.3.3(外部副作用)。
// DBトランザクション内で実行できない外部副作用(外部システムへのHTTP送信・LINE通知)を
// 送信前にoutboxへ登録し、送信結果を追跡・再送できるようにするための共通ヘルパー。
// integration_outbox_events(外部システム宛)・notification_outbox_events(自社配信、
// 現状はLINEのみ)は同じ形状(status/attempt_count/last_error/sent_at)を持つため、
// テーブル名をパラメータ化して共用する。
//
// 全体統合対応 実装計画(PR5)で用意した旧enqueueOutboxEvent()等(source_type/source_id
// を持たずintegration_outbox_events専用)は、実際の送信元(呼び出し元)が無いまま未使用
// だったため、本PRで冪等性に必要なsource_type/source_id・テーブル切り替えに対応した
// この実装へ置き換えた。

export type OutboxTable = "integration_outbox_events" | "notification_outbox_events";

export type OutboxRow = {
  id: string;
  source_type: string;
  source_id: string;
  event_type: string;
  target_system_key: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "failed";
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

// 既に同じ組み合わせ(source_type, source_id, event_type, target_system_key)で登録済みの
// 場合は既存行のidを返す(冪等)。呼び出し元(purchase-grants.ts等)は再実行時に
// 重複行を作らずに済む。
export async function enqueueOutboxEvent(
  supabase: SupabaseServerClient,
  table: OutboxTable,
  sourceType: string,
  sourceId: string,
  eventType: string,
  targetSystemKey: string,
  payload: Record<string, unknown>
): Promise<string> {
  const { data: inserted, error: insertError } = await supabase
    .from(table)
    .insert({ source_type: sourceType, source_id: sourceId, event_type: eventType, target_system_key: targetSystemKey, payload })
    .select("id")
    .single();
  if (!insertError) return inserted.id as string;

  if (insertError.code !== "23505") throw insertError;
  const { data: existing, error: fetchError } = await supabase
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

export async function markOutboxSent(supabase: SupabaseServerClient, table: OutboxTable, id: string): Promise<void> {
  const { error } = await supabase.from(table).update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function markOutboxFailed(
  supabase: SupabaseServerClient,
  table: OutboxTable,
  id: string,
  message: string,
  previousAttemptCount: number
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update({ status: "failed", last_error: message, attempt_count: previousAttemptCount + 1 })
    .eq("id", id);
  if (error) throw error;
}

// 管理画面(未送信/送信失敗の一覧・再送)向け。
export async function listPendingOrFailedOutboxEvents(supabase: SupabaseServerClient, table: OutboxTable): Promise<OutboxRow[]> {
  const { data, error } = await supabase
    .from(table)
    .select("id, source_type, source_id, event_type, target_system_key, payload, status, attempt_count, last_error, created_at, sent_at")
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as OutboxRow[];
}
