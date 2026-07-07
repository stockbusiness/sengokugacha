-- Stripe設定を管理画面から編集できるようにするための1行運用テーブル。
-- env varではなくDBに保持することで、キー変更のたびに再デプロイが不要になる。
-- stripe_secret_key / stripe_webhook_secret は機密情報のため、管理画面APIは
-- レスポンス時にマスクして返す(アプリ側の実装で対応。DB上は平文で保持)。

create table payment_settings (
  id uuid primary key default gen_random_uuid(),
  stripe_publishable_key text,
  stripe_secret_key text,
  stripe_webhook_secret text,
  kokudaka_pack_amount_yen int not null default 500,
  kokudaka_pack_kokudaka int not null default 500,
  gacha_ticket_pack_amount_yen int not null default 150,
  gacha_ticket_pack_tickets int not null default 1,
  updated_at timestamptz not null default now()
);

alter table payment_settings enable row level security;
