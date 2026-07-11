-- 城下町デジタル内覧機能。docs/metaverse-tour-implementation-plan.md の設計に基づく。
--
-- 重要な方針:
--   - 販売価格・権利内容・オーナー特典は「internal_」列としてのみ保持し、
--     プレイヤー向けAPI(src/lib/metaverse.ts の player向け取得関数)からは
--     常に除外する。運営が将来の営業活動のために管理画面から入力・参照できる
--     だけの位置づけで、LIFF・外部内覧ページには一切表示しない。
--   - 商業的な販売状態(sold/limited/under_negotiation等)は持たず、
--     status は draft/coming_soon/published/hidden の「公開状態」のみとする。
--   - 一時内覧トークンはJWTではなく、ランダム値をハッシュ化してDBに保存し、
--     有効期限・アクセス回数・失効(revoke)をDB側で厳密に管理する方式にする。
--   - シーン・マップのhotspot座標は画像内のパーセント位置(0〜100)であり、
--     将来の本メタバース(3D空間)の座標とは独立させる。
--     external_world_ref 列に、将来のワールドID等を後から紐付けられるようにする。

create table metaverse_areas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text,
  short_description text,
  description text,
  thumbnail_url text,
  main_image_url text,
  is_recommended boolean not null default false,
  is_new boolean not null default false,
  display_order integer not null default 0,
  status text not null default 'draft', -- 'draft' | 'published'
  published_at timestamptz,
  closed_at timestamptz,
  external_world_ref text,
  internal_price_range_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table metaverse_areas enable row level security;
create index idx_metaverse_areas_status on metaverse_areas (status, display_order);

create table metaverse_building_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table metaverse_building_types enable row level security;

create table metaverse_properties (
  id uuid primary key default gen_random_uuid(),
  property_code text not null unique,
  name text not null,
  area_id uuid not null references metaverse_areas(id),
  building_type_id uuid references metaverse_building_types(id),
  short_description text,
  description text,
  main_image_url text,
  feature_tags text[] not null default '{}',
  intended_use text,
  status text not null default 'draft', -- 'draft' | 'coming_soon' | 'published' | 'hidden'
  is_recommended boolean not null default false,
  is_new boolean not null default false,
  display_order integer not null default 0,
  external_world_ref text,
  internal_price_yen integer,
  internal_rights_note text,
  internal_benefits_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table metaverse_properties enable row level security;
create index idx_metaverse_properties_area on metaverse_properties (area_id, status, display_order);

create table metaverse_property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references metaverse_properties(id),
  image_url text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table metaverse_property_images enable row level security;
create index idx_metaverse_property_images_property on metaverse_property_images (property_id, display_order);

create table metaverse_tour_scenes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references metaverse_properties(id),
  name text not null,
  image_url text not null,
  thumbnail_url text,
  description text,
  display_order integer not null default 0,
  is_published boolean not null default false,
  allow_zoom boolean not null default true,
  is_auto_tour_target boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table metaverse_tour_scenes enable row level security;
create index idx_metaverse_tour_scenes_property on metaverse_tour_scenes (property_id, display_order);

create table metaverse_scene_hotspots (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references metaverse_tour_scenes(id),
  title text not null,
  description text,
  position_x numeric not null, -- 0〜100(画像内のパーセント位置)
  position_y numeric not null,
  icon text,
  status text not null default 'planned', -- 'available_now' | 'planned' | 'future_concept'
  display_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table metaverse_scene_hotspots enable row level security;
create index idx_metaverse_scene_hotspots_scene on metaverse_scene_hotspots (scene_id, display_order);

create table metaverse_maps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null,
  created_at timestamptz not null default now()
);

alter table metaverse_maps enable row level security;

create table metaverse_map_hotspots (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references metaverse_maps(id),
  area_id uuid not null references metaverse_areas(id),
  position_x numeric not null,
  position_y numeric not null,
  created_at timestamptz not null default now()
);

alter table metaverse_map_hotspots enable row level security;
create index idx_metaverse_map_hotspots_map on metaverse_map_hotspots (map_id);

create table metaverse_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  property_id uuid not null references metaverse_properties(id),
  created_at timestamptz not null default now(),
  unique (user_id, property_id)
);

alter table metaverse_favorites enable row level security;
create index idx_metaverse_favorites_user on metaverse_favorites (user_id, created_at);

create table metaverse_recent_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  property_id uuid not null references metaverse_properties(id),
  viewed_at timestamptz not null default now()
);

alter table metaverse_recent_views enable row level security;
create index idx_metaverse_recent_views_user on metaverse_recent_views (user_id, viewed_at desc);

-- 一時内覧トークン。トークン本体は平文保存せず、ハッシュ値のみ保存する。
create table metaverse_tour_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references users(id),
  agent_id uuid references agents(id),
  property_id uuid not null references metaverse_properties(id),
  return_url text,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  access_count integer not null default 0,
  status text not null default 'active', -- 'active' | 'expired' | 'revoked'
  created_at timestamptz not null default now()
);

alter table metaverse_tour_sessions enable row level security;
create index idx_metaverse_tour_sessions_expires on metaverse_tour_sessions (expires_at);

-- 内覧トークンの既定有効期限(分)。1行運用、既存の payment_settings/line_settings と同様の構成。
create table metaverse_tour_settings (
  id uuid primary key default gen_random_uuid(),
  tour_token_ttl_minutes integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table metaverse_tour_settings enable row level security;

create table metaverse_view_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references metaverse_tour_sessions(id),
  user_id uuid references users(id),
  event_type text not null,
  property_id uuid references metaverse_properties(id),
  scene_id uuid references metaverse_tour_scenes(id),
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table metaverse_view_events enable row level security;
create index idx_metaverse_view_events_property on metaverse_view_events (property_id, event_type, created_at);

create table metaverse_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  agent_id uuid references agents(id),
  property_id uuid references metaverse_properties(id),
  inquiry_type text not null,
  preferred_contact text not null,
  consent_personal_info boolean not null default false,
  consent_agent_share boolean not null default false,
  preferred_datetime text,
  budget text,
  purpose text,
  memo text,
  status text not null default 'new', -- 'new' | 'contacted' | 'in_progress' | 'closed'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table metaverse_inquiries enable row level security;
create index idx_metaverse_inquiries_user on metaverse_inquiries (user_id, created_at);
create index idx_metaverse_inquiries_agent on metaverse_inquiries (agent_id, status);

create table metaverse_inquiry_histories (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references metaverse_inquiries(id),
  note text not null,
  created_at timestamptz not null default now()
);

alter table metaverse_inquiry_histories enable row level security;
create index idx_metaverse_inquiry_histories_inquiry on metaverse_inquiry_histories (inquiry_id, created_at);

-- 内覧画像用のStorageバケット(武将画像バケットと同様、公開読み取り可・書き込みはservice roleのみ)。
insert into storage.buckets (id, name, public)
values ('metaverse-images', 'metaverse-images', true)
on conflict (id) do update set public = true;
