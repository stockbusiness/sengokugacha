-- 城主プラン(Phase 1)の報酬元帳。詳細は「城主プラン実装要件定義書」8章・14.4・14.5参照。
-- 報酬計算そのもの(純粋関数)はsrc/lib/castle-commission-engine.tsに実装済み。
-- ここではその結果を永続化するためのテーブルのみを定義する。

create table commission_rule_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  product_type text not null default 'land_plot' check (product_type in ('land_plot')),
  lord_rate numeric(6,4) not null,
  agency_rate numeric(6,4) not null,
  organization_rate numeric(6,4) not null,
  regional_activity_rate numeric(6,4) not null,
  development_fund_rate numeric(6,4) not null,
  hq_rate numeric(6,4) not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  effective_from timestamptz,
  effective_to timestamptz,
  created_by text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table commission_rule_sets enable row level security;
create index idx_commission_rule_sets_published on commission_rule_sets(status, effective_from);

create table commission_ledger (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id),
  plot_id uuid references castle_plots(id),
  castle_id uuid references castles(id),
  contract_id uuid references castle_lord_contracts(id),
  rule_set_id uuid not null references commission_rule_sets(id),
  recipient_type text not null check (recipient_type in
    ('lord', 'agency', 'organization', 'hq', 'development_fund', 'regional_activity')),
  recipient_user_id uuid references users(id),
  recipient_agent_id uuid references agents(id),
  base_amount_yen int not null,
  rate numeric(6,4) not null,
  amount_yen int not null,
  status text not null default 'held' check (status in
    ('pending', 'held', 'confirmed', 'payable', 'paid', 'reversed')),
  reversal_of_ledger_id uuid references commission_ledger(id),
  held_reason text,
  confirmed_at timestamptz,
  payable_at timestamptz,
  paid_at timestamptz,
  payout_id uuid,
  created_at timestamptz not null default now()
);
alter table commission_ledger enable row level security;
create index idx_commission_ledger_purchase on commission_ledger(purchase_id);
create index idx_commission_ledger_recipient on commission_ledger(recipient_type, recipient_user_id, recipient_agent_id);
-- 同一注文・同一区分の「オリジナル行」は1件のみ(8.7 TC7冪等性のDB側バックストップ)。反対仕訳行は対象外。
create unique index uq_commission_ledger_purchase_recipient_original
  on commission_ledger(purchase_id, recipient_type) where reversal_of_ledger_id is null;

create table commission_adjustments (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references commission_ledger(id),
  reversal_ledger_id uuid references commission_ledger(id),
  adjustment_type text not null check (adjustment_type in ('cancel', 'reversal')),
  amount_yen int not null,
  reason text,
  stripe_refund_id text,
  created_by text,
  created_at timestamptz not null default now()
);
alter table commission_adjustments enable row level security;
create index idx_commission_adjustments_ledger on commission_adjustments(ledger_id);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null,
  recipient_user_id uuid references users(id),
  recipient_agent_id uuid references agents(id),
  total_amount_yen int not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  created_by text,
  notes text,
  created_at timestamptz not null default now()
);
alter table payouts enable row level security;

alter table commission_ledger add constraint fk_commission_ledger_payout
  foreign key (payout_id) references payouts(id);

-- 要件書0.3: テーブル定義のみ。書き込みロジックはPhase1では実装しない。
create table regional_transactions (
  id uuid primary key default gen_random_uuid(),
  castle_id uuid not null references castles(id),
  transaction_type text not null,
  product_name text,
  amount_yen int not null,
  seller_user_id uuid references users(id),
  seller_agent_id uuid references agents(id),
  status text not null default 'draft',
  occurred_at timestamptz,
  created_at timestamptz not null default now()
);
alter table regional_transactions enable row level security;
