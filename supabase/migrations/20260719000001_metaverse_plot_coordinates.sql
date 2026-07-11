-- 城下町マップ・区画座標基盤(戦国メタバース 城下町マップ・区画座標実装指示書 準拠)。
-- 指示書のmaps/areas/plotsは、二重管理を避けるため既存のmetaverse_maps/metaverse_areas/
-- metaverse_propertiesに列追加する形で統合する(詳細はdocs/plot-coordinate-implementation-plan.md)。
-- buildingsも独立テーブルにせず、既存metaverse_properties(1区画=1建物の現行構造)に列追加する。

-- --- metaverse_maps: バージョン管理・SVG座標系・Unity変換用の基準値 ---
alter table metaverse_maps
  add column if not exists map_code text unique,
  add column if not exists version text not null default 'v0.1',
  add column if not exists viewbox_width integer not null default 4096,
  add column if not exists viewbox_height integer not null default 4096,
  add column if not exists origin_x numeric not null default 2048,
  add column if not exists origin_y numeric not null default 2048,
  add column if not exists unity_scale numeric not null default 0.25,
  add column if not exists status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  add column if not exists published_at timestamptz;

-- --- metaverse_areas: マップ紐付け・内部分類・ポリゴン座標 ---
alter table metaverse_areas
  add column if not exists map_id uuid references metaverse_maps(id),
  add column if not exists area_code text unique,
  add column if not exists internal_type text,
  add column if not exists polygon jsonb;

-- --- metaverse_blocks(街区。指示書のareas→blocksの間の新規階層) ---
create table metaverse_blocks (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references metaverse_areas(id),
  block_code text not null unique,
  display_name text not null,
  polygon jsonb,
  capacity integer,
  status text not null default 'draft' check (status in ('draft', 'published')),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table metaverse_blocks enable row level security;
create index idx_metaverse_blocks_area on metaverse_blocks (area_id, display_order);

-- --- metaverse_roads(道路。区画のroad_idから参照される) ---
create table metaverse_roads (
  id uuid primary key default gen_random_uuid(),
  map_id uuid references metaverse_maps(id),
  road_code text not null unique,
  display_name text not null,
  path jsonb,
  road_type text,
  width numeric,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now()
);

alter table metaverse_roads enable row level security;

-- --- metaverse_properties(=区画/plot): 街区紐付け・ポリゴン・建物配置・Unity列・建物バリエーション ---
alter table metaverse_properties
  add column if not exists block_id uuid references metaverse_blocks(id),
  add column if not exists internal_category text,
  add column if not exists polygon jsonb,
  add column if not exists anchor_x numeric,
  add column if not exists anchor_y numeric,
  add column if not exists frontage_angle numeric,
  add column if not exists road_id uuid references metaverse_roads(id),
  add column if not exists unity_x numeric,
  add column if not exists unity_y numeric,
  add column if not exists unity_z numeric,
  add column if not exists unity_rotation_y numeric,
  add column if not exists size_rank text,
  add column if not exists location_rank text,
  add column if not exists map_version text,
  add column if not exists exterior_variant text,
  add column if not exists interior_variant text,
  add column if not exists crest_asset text,
  add column if not exists nameplate_text text;

-- --- metaverse_plot_rights(区画の所有権・代理店特別利用権) ---
create table metaverse_plot_rights (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references metaverse_properties(id),
  user_id uuid references users(id),
  agency_id uuid references agents(id),
  order_reference text,
  right_type text not null check (right_type in ('ownership', 'special_usage_right', 'rental', 'management', 'reserved')),
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active', 'ended', 'pending')),
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table metaverse_plot_rights enable row level security;
create index idx_metaverse_plot_rights_property on metaverse_plot_rights (property_id);
create index idx_metaverse_plot_rights_user on metaverse_plot_rights (user_id);
create index idx_metaverse_plot_rights_agency on metaverse_plot_rights (agency_id);

-- --- metaverse_points_of_interest(岐阜城・信長居館等の地図上の目印) ---
create table metaverse_points_of_interest (
  id uuid primary key default gen_random_uuid(),
  map_id uuid references metaverse_maps(id),
  poi_type text,
  name text not null,
  map_x numeric not null,
  map_y numeric not null,
  unity_x numeric,
  unity_y numeric,
  unity_z numeric,
  detail_url text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now()
);

alter table metaverse_points_of_interest enable row level security;

-- --- metaverse_plot_geometry_history(区画のポリゴン・建物アンカー変更履歴) ---
create table metaverse_plot_geometry_history (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references metaverse_properties(id),
  old_polygon jsonb,
  new_polygon jsonb,
  old_anchor_x numeric,
  old_anchor_y numeric,
  new_anchor_x numeric,
  new_anchor_y numeric,
  changed_by text,
  changed_at timestamptz not null default now(),
  reason text,
  map_version text
);

alter table metaverse_plot_geometry_history enable row level security;
create index idx_metaverse_plot_geometry_history_property on metaverse_plot_geometry_history (property_id, changed_at);
