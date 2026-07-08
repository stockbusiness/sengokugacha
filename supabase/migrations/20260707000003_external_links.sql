-- MVP画面#9「送客導線(AIアート教室/NFTマーケット/評議員)」用の設定テーブル。
-- 実際の遷移先URLは未確定のため、管理画面(/admin/links)から後日設定する前提でNULLのまま投入する。
-- url が NULL の項目はパスポート画面に表示しない。

create table external_links (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  url text,
  updated_at timestamptz not null default now()
);

alter table external_links enable row level security;

insert into external_links (key, label, url) values
  ('ai_art_school', 'AIアート教室', null),
  ('nft_marketplace', 'NFTマーケット', null),
  ('advisor_program', '評議員募集', null)
on conflict (key) do nothing;
