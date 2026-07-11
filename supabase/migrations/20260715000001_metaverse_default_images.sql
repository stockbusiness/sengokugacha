-- エリア・物件の画像が未設定の場合に使う、共通のデフォルト画像。
-- 個別に画像をアップロードした場合はそちらを優先し、未設定(null)のままなら
-- このデフォルト画像にフォールバックする(「独自の画像 or デフォルト」を選べる、
-- という運用は「アップロードするかしないか」で表現する)。
alter table metaverse_tour_settings
  add column if not exists default_property_image_url text,
  add column if not exists default_area_image_url text;
