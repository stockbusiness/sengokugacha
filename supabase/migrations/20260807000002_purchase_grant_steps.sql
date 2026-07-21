-- 千ノ国パスポート次期改修指示書 P0-2(§4.1・4.2・6.3)。
-- 購入権利付与をステップ単位で冪等化し、手動再実行の同時実行を防止する。

-- ステップ単位の実行状態。unique(purchase_id, step_key)により、同一ステップの
-- 二重完了処理を防ぐ(既にcompletedのステップはスキップする設計と対で機能する)。
create table purchase_grant_steps (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id),
  step_key text not null check (step_key in (
    'balance_granted', 'plot_completed', 'commission_posted',
    'agent_sale_recorded', 'referral_confirmed', 'notification_sent'
  )),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  attempt_count int not null default 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_id, step_key)
);

alter table purchase_grant_steps enable row level security;

-- grant_statusに'processing'/'retrying'を追加する(手動再実行の排他制御用)。
-- 'failed'→'retrying'への原子的な遷移(guard-clause update)に成功した1リクエストだけが
-- 再実行処理へ進めるようにする。
alter table purchases drop constraint purchases_grant_status_check;
alter table purchases add constraint purchases_grant_status_check
  check (grant_status in ('not_started', 'processing', 'failed', 'retrying', 'granted'));

-- agent_salesの二重登録防止。既存行にはpurchase_idが無いため部分unique indexとする
-- (castle_province_relations等、既存の「後付けunique制約」パターンを踏襲)。
alter table agent_sales add column purchase_id uuid references purchases(id);
create unique index uq_agent_sales_purchase_id on agent_sales(purchase_id) where purchase_id is not null;
