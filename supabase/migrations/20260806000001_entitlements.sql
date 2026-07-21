-- 千ノ国パスポート 全体統合対応 実装計画(PR6)。
-- 権利付与API(entitlement.granted/updated/revoked)で受けた権利の台帳。

create table entitlements (
  id uuid primary key default gen_random_uuid(),
  entitlement_id text not null unique, -- 外部(送信元システム)発番
  common_user_id text not null,
  user_id uuid references users(id), -- common_user_idをローカルuserへ解決できた場合のみ
  entitlement_type text not null,
  product_code text,
  status text not null default 'granted' check (status in ('granted', 'revoked')),
  quantity int not null default 1,
  valid_from timestamptz,
  valid_until timestamptz,
  order_id text,
  order_item_id text,
  source_system_key text not null,
  metadata jsonb,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table entitlements enable row level security;

create index idx_entitlements_user_id on entitlements(user_id);
create index idx_entitlements_common_user_id on entitlements(common_user_id);
