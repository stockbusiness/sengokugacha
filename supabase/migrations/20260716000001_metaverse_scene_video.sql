-- 内覧シーンに、静止画に加えて動画(館内ウォークスルー等)を設定できるようにする。
-- image_url は既存どおり必須(サムネイル・動画のポスター・動画非対応時のフォールバックとして使う)。
-- video_url が設定されている場合、外部内覧ページはそのシーンを動画で再生する。
alter table metaverse_tour_scenes
  add column if not exists video_url text,
  add column if not exists video_duration_ms integer,
  add column if not exists video_mime_type text,
  add column if not exists video_file_size_bytes bigint;

-- 動画用のStorageバケット(画像バケットと分離。gacha-animationsバケットと同じ方針)。
insert into storage.buckets (id, name, public)
values ('metaverse-videos', 'metaverse-videos', true)
on conflict (id) do update set public = true;
