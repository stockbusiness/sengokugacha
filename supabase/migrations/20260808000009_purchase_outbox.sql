-- 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 §4.3.3(外部副作用)。
-- 購入権利付与のうち紹介confirm(sengoku-ai.comへのHTTP POST)・LINE通知は、既存実装では
-- DBトランザクションの外で直接呼び出され、失敗時は console.error に記録されるのみで
-- 再送する手段が無かった(呼び出し元(confirmReferral/notifyPlotPurchase経由の
-- sendBestEffort)がfail-openで例外を握りつぶす設計のため、purchase_grant_stepsの
-- ステップ自体は常に「completed」扱いになり、失敗が記録に残らなかった)。
-- 送信前にoutboxへ登録し、送信結果(成功/失敗)をそのまま記録・追跡できるようにする。

-- integration_outbox_events(全体統合対応PR5で新設済み、これまで実際の送信元は無かった)へ
-- 冪等性のためのsource_type/source_id列を追加する。既存行は無い前提(PR5時点では基盤のみで
-- 実際にinsertする呼び出し元が存在しなかったため)。もし本番に既存行がある場合、本マイグレーション
-- はNOT NULL制約の追加に失敗するため、事前に
-- `select count(*) from integration_outbox_events;` で0件であることを確認すること。
alter table integration_outbox_events
  add column source_type text not null,
  add column source_id text not null;

alter table integration_outbox_events add constraint integration_outbox_events_source_event_target_key
  unique (source_type, source_id, event_type, target_system_key);

-- notification_outbox_events(新規)。LINE通知等、外部システムではなく自社配信経路向けの
-- outbox。target_system_keyはintegration_outbox_eventsとスキーマを揃えるため保持し、
-- 通知チャネル種別(現状は'line'のみ)を表す。
create table notification_outbox_events (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id text not null,
  event_type text not null,
  target_system_key text not null default 'line',
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempt_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (source_type, source_id, event_type, target_system_key)
);

alter table notification_outbox_events enable row level security;
