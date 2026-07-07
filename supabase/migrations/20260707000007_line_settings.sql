-- LIFF ID / LINEログインチャネルIDを管理画面から設定できるようにするための1行運用テーブル。
-- env var(NEXT_PUBLIC_LIFF_ID, LINE_LOGIN_CHANNEL_ID)は廃止し、こちらに一本化する。
-- Supabase接続情報やセッション署名鍵など、DB接続そのものに必要な値はこの仕組みに含めない
-- (「DBに繋ぐための設定をDBに保存する」という循環になるため、それらは引き続きenv var管理)。

create table line_settings (
  id uuid primary key default gen_random_uuid(),
  liff_id text,
  channel_id text,
  updated_at timestamptz not null default now()
);

alter table line_settings enable row level security;
