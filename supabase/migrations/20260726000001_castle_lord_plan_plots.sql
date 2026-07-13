-- 城主プラン(Phase 1)の区画マスタ・販売枠。詳細は「城主プラン実装要件定義書」7章・14.3参照。
--
-- castle_plots: 物理区画そのもの(7.2の8状態)。管理画面で城ごとに事前登録しておく。
-- plot_allocations: 城主契約への「販売枠capacity付与」イベント(Phase1は段階1=30区画のみ運用)。
-- castle_plots.allocation_idで、どの付与によって販売可能になった区画かを紐づける。

create table castle_plots (
  id uuid primary key default gen_random_uuid(),
  castle_id uuid not null references castles(id),
  allocation_id uuid, -- 後述のplot_allocationsへのFKは同ファイル内で追加する
  plot_code text not null,
  block_label text,
  name text not null,
  description text,
  main_image_url text,
  price_yen int not null,
  status text not null default 'draft' check (status in
    ('draft', 'available', 'reserved', 'application_pending', 'payment_pending', 'sold', 'cancelled', 'suspended')),
  unity_x numeric, unity_y numeric, unity_z numeric, unity_rotation_y numeric, -- 列のみ(0.3)
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (castle_id, plot_code)
);
alter table castle_plots enable row level security;
create index idx_castle_plots_castle_status on castle_plots(castle_id, status);

create table plot_allocations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references castle_lord_contracts(id),
  castle_id uuid not null references castles(id),
  stage int not null default 1 check (stage in (1, 2, 3)), -- Phase1はstage=1のみ発生
  granted_capacity int not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by text,
  granted_at timestamptz not null default now(),
  revoked_by text,
  revoked_at timestamptz,
  revoke_reason text,
  notes text,
  created_at timestamptz not null default now()
);
alter table plot_allocations enable row level security;
create index idx_plot_allocations_contract on plot_allocations(contract_id);

alter table castle_plots add constraint fk_castle_plots_allocation
  foreign key (allocation_id) references plot_allocations(id);
