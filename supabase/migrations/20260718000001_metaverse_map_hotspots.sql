-- 城下町の全体マップ画像+タップ可能なエリアのホットスポット表示を追加。
-- マップ画像・エリア配置座標のイラスト素材がまだ無いため、管理画面から画像を
-- アップロードするまではLIFF側には何も表示されない(既存のカード一覧のみ)。
alter table metaverse_maps
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table metaverse_map_hotspots
  add column if not exists label text,
  add column if not exists icon text,
  add column if not exists display_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();
