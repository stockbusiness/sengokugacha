-- カードテンプレート合成(武将カード画像にスキル名・ステータス等を焼き込む機能)用。
-- 既存のstats_json/loreと異なり、スキル名は独立した1行テキストとしてカードに表示するため
-- 専用列として追加する。
alter table warlords
  add column if not exists skill_name text;
