-- 動画ガチャ演出。Claude Code向け仕様書の設計をベースにしているが、以下の点は
-- 既存のガチャ設計(03_gacha_game_design_v1.4.md)に合わせて読み替え・簡略化している。
--   - レアリティは既存の3段階(common=足軽級/mid=武将級/rare=大名級)を使う
--     (仕様書のN/R/SR/SSR/LRという5段階レアリティは採用しない)
--   - 単発ガチャのみのため draw_mode(single/multi)・multi_draw演出は設けない
--   - ガチャ・イベントは1種類のみのため gacha_id/event_id は設けない
--   - 天井(pity)・確定枠の概念が無いため only_pity_trigger 等は設けない
-- 上記以外(優先度/weight/公開期間/公開状態/分析イベント/一覧検索)は仕様書どおり実装する。

create table gacha_animation_assets (
  id uuid primary key default gen_random_uuid(),
  animation_key text not null unique,
  name text not null,
  description text,

  rarity text not null default 'ANY', -- 'ANY' | 'common' | 'mid' | 'rare'
  only_new_card boolean not null default false,

  video_url text not null,
  video_storage_key text not null,
  poster_url text,
  poster_storage_key text,

  mime_type text not null,
  file_size_bytes bigint not null,
  duration_ms integer not null default 0,
  width integer,
  height integer,
  has_audio boolean not null default false,

  allow_skip boolean not null default true,
  skip_after_ms integer not null default 1000,
  minimum_play_ms integer not null default 0,

  status text not null default 'draft', -- 'draft' | 'published' | 'stopped'
  is_default boolean not null default false,
  priority integer not null default 0,
  weight integer not null default 100,

  starts_at timestamptz,
  ends_at timestamptz,

  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table gacha_animation_assets enable row level security;

create index idx_gacha_animation_lookup
  on gacha_animation_assets (status, rarity, starts_at, ends_at);

-- どの演出が再生されたかをガチャ履歴から追跡できるようにする。
alter table gacha_logs
  add column animation_asset_id uuid references gacha_animation_assets(id),
  add column animation_key text;

-- 動画再生の分析ログ(仕様書17章)。
create table gacha_animation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  gacha_log_id uuid references gacha_logs(id),
  animation_asset_id uuid references gacha_animation_assets(id),
  animation_key text,
  event_type text not null, -- gacha_video_load_started / _started / _completed / _skipped / _failed 等
  rarity text,
  playback_ms integer,
  error_code text,
  user_agent text,
  is_liff boolean not null default false,
  created_at timestamptz not null default now()
);

alter table gacha_animation_events enable row level security;

create index idx_gacha_animation_events_lookup on gacha_animation_events (animation_asset_id, event_type, created_at);

-- 20260708000012で踏んだ「バケットが一度非公開で作られると on conflict do nothing では直せない」
-- 不具合を踏まえ、最初から on conflict (id) do update set public = true としておく。
insert into storage.buckets (id, name, public)
values ('gacha-animations', 'gacha-animations', true)
on conflict (id) do update set public = true;
