-- 城主プラン(Phase 1)の区画予約・決済連携。詳細は「城主プラン実装要件定義書」7章・8.1参照。
-- 新しい決済処理は作らず、既存のpurchases/Stripe連携を拡張して使う。

-- 区画の所有権は専用テーブルを設けず、castle_plots自体に直接記録する
-- (要件書15.1に明示的な区画所有権テーブルが定義されていないため)。
alter table castle_plots add column owner_user_id uuid references users(id);
alter table castle_plots add column sold_at timestamptz;
alter table castle_plots add column sold_price_yen int;

-- 購入者ごとの予約・購入トランザクション(要件書7.3の排他制御)。
create table plot_reservations (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references castle_plots(id),
  buyer_user_id uuid not null references users(id),
  selling_agent_id uuid references agents(id),
  status text not null default 'pending' check (status in ('pending', 'converted', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  purchase_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table plot_reservations enable row level security;
create index idx_plot_reservations_plot on plot_reservations(plot_id);
-- 同一区画に「未処理の予約」は同時に1件のみ(7.3「同一区画を複数購入者へ販売しない」をDBで保証)。
create unique index uq_plot_reservations_pending on plot_reservations(plot_id) where status = 'pending';

-- 既存purchasesテーブルの拡張。
alter table purchases drop constraint purchases_item_type_check;
alter table purchases add constraint purchases_item_type_check
  check (item_type in ('kokudaka', 'gacha_ticket', 'tenka_pass', 'land_plot', 'castle_lord_plan'));

alter table purchases add column plot_id uuid references castle_plots(id);
alter table purchases add column contract_id uuid references castle_lord_contracts(id);
alter table purchases add column selling_agent_id uuid references agents(id);
alter table purchases add column payment_intent_id text;
alter table purchases add column amount_received_yen int;
alter table purchases add column refunded_amount_yen int not null default 0;

alter table plot_reservations add constraint fk_plot_reservations_purchase
  foreign key (purchase_id) references purchases(id);
