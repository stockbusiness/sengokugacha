-- 外部代理店システム(sengoku-ai.com)との連携。
-- external_id: sengoku-ai.com発行の代理店コード。ローカルで新規作成した代理店にも
-- 送信用に自前で採番する(source='local')。同期で受信した代理店はsource='sengoku-ai'。
-- parent_external_id: 親がまだローカルに存在しない場合の未解決の親情報。後から
-- 該当のexternal_idを持つ代理店が届いた時点でparent_agent_idを解決する。
alter table agents
  add column if not exists external_id text unique,
  add column if not exists parent_agent_id uuid references agents(id),
  add column if not exists parent_external_id text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists login_email text,
  add column if not exists phone text,
  add column if not exists line_url text,
  add column if not exists status text not null default 'active' check (status in ('active', 'inactive')),
  add column if not exists role_level int,
  add column if not exists source text not null default 'local' check (source in ('local', 'sengoku-ai')),
  add column if not exists lp_urls jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_agents_parent_agent_id on agents (parent_agent_id);
create index if not exists idx_agents_parent_external_id on agents (parent_external_id);
create index if not exists idx_agents_login_email on agents (login_email);

-- 外部代理店システムとの接続設定(シングルトン。payment_settings/line_settingsと同じ方針)。
create table agency_integration_settings (
  id uuid primary key default gen_random_uuid(),
  -- 受信用(sengoku-ai.com → このアプリ)。このアプリが発行し、平文はキー発行時のみ表示する。
  inbound_api_key_hash text,
  inbound_api_key_last4 text,
  -- 送信用(このアプリ → sengoku-ai.com)。sengoku-ai.com側が発行したキーをそのまま使う必要があるため平文保存(payment_settingsのStripeキーと同じ方針)。
  outbound_endpoint_url text,
  outbound_api_key text,
  bidirectional_sync_enabled boolean not null default false,
  sso_enabled boolean not null default false,
  sso_issuer_url text not null default 'https://sengoku-ai.com',
  sso_jwks_url text not null default 'https://sengoku-ai.com/api/sso/jwks.php',
  sso_audience text not null default 'sengoku-passport',
  updated_at timestamptz not null default now()
);

alter table agency_integration_settings enable row level security;

-- SSO JWTの再利用防止(仕様書8章)。
create table agency_sso_used_jti (
  id uuid primary key default gen_random_uuid(),
  jti text not null unique,
  sub text not null,
  aud text not null,
  expires_at timestamptz not null,
  used_at timestamptz not null default now()
);

alter table agency_sso_used_jti enable row level security;
create index idx_agency_sso_used_jti_expires on agency_sso_used_jti (expires_at);
