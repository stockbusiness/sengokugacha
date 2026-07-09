-- リッチメニュー画像を管理画面からアップロード・差し替えできるようにするための対応。
-- 未設定(null)の場合は従来通り public/rich-menu.jpg (アプリに同梱の既定画像) を使用する。
alter table line_settings
  add column rich_menu_image_url text;

-- 20260708000012 と同じ理由(バケットが一度でも非公開で作られると
-- on conflict do nothing では直せない)を踏まえ、最初から
-- on conflict (id) do update set public = true としておく。
insert into storage.buckets (id, name, public)
values ('rich-menu-images', 'rich-menu-images', true)
on conflict (id) do update set public = true;
