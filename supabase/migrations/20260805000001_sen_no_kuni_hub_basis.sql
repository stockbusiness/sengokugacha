-- 千ノ国パスポート 全体統合対応 実装計画(PR5)。
-- 00_COMMON_INTEGRATION_CONTRACT.md 6章の新規HMAC連携基盤(権利付与API・購入/返金
-- イベント受信で使用予定)。既存のsengoku-ai.com連携(agency_integration_settings、
-- APIキー認証)とは完全に独立させ、既存連携には一切影響しない。

-- system_keyごとのHMAC鍵管理。生鍵は署名検証に必要なため平文で保存する
-- (payment_settings.stripe_webhook_secret等、署名検証用シークレットの既存方針を踏襲)。
create table sen_no_kuni_hub_settings (
  id uuid primary key default gen_random_uuid(),
  system_key text not null unique,
  key_id text not null unique,
  hmac_secret text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table sen_no_kuni_hub_settings enable row level security;

-- X-SenNoKuni-Nonceのワンタイム利用管理(リプレイ防止)。agency_sso_used_jtiと同じ
-- 「unique制約で二重使用を検知する」設計。
create table sen_no_kuni_hub_used_nonces (
  id uuid primary key default gen_random_uuid(),
  key_id text not null,
  nonce text not null,
  created_at timestamptz not null default now(),
  unique (key_id, nonce)
);

alter table sen_no_kuni_hub_used_nonces enable row level security;

-- 受信イベントの冪等性管理。event_idはsource_system_key単位で一意とする
-- (複数システムでevent_idの採番空間が独立している可能性があるため)。
create table integration_inbox_events (
  id uuid primary key default gen_random_uuid(),
  source_system_key text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  payload_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed', 'dead')),
  attempt_count int not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (source_system_key, event_id)
);

alter table integration_inbox_events enable row level security;

-- 送信予定イベントの永続化+再送管理(このアプリから他システムへHMAC署名付きで
-- イベントを送る場合の送達記録。PR5時点では基盤のみで、実際の送信先はまだ無い)。
create table integration_outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  target_system_key text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempt_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table integration_outbox_events enable row level security;
