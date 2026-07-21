-- 千ノ国パスポート 全体統合対応 実装計画(PR7)。

-- purchases側の担当者スナップショット(共通実装契約4.2章の sales_agent_id /
-- closing_agent_id に対応)。既存のselling_agent_id(land_plot予約時点の紹介代理店
-- スナップショット)は維持し、新カラムは主に外部購入イベント受信で使う想定。
alter table purchases add column sales_agent_id uuid references agents(id);
alter table purchases add column closing_agent_id uuid references agents(id);

-- 購入・決済・返金イベントの受信記録。商品カタログ・注文ID体系がまだ確定していない
-- ため、当面は監査目的の記録のみとし、権利・残高への反映はentitlement.granted/revoked
-- (PR6)を介した場合に限定する。agency_id等は解決前の外部コードをそのまま保持する
-- (purchasesへの反映は別途、対応関係が確定した時点で行う)。
create table shopping_order_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  order_id text,
  order_item_id text,
  common_user_id text,
  user_id uuid references users(id),
  agency_id text,
  sales_agent_id text,
  closing_agent_id text,
  amount int,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table shopping_order_events enable row level security;

create index idx_shopping_order_events_order_id on shopping_order_events(order_id);
create index idx_shopping_order_events_user_id on shopping_order_events(user_id);
