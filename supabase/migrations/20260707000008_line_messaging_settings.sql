-- LINEリッチメニュー管理用。line_settings(LIFF/LINEログイン設定)に相乗りする形で、
-- Messaging API(公式アカウント)のチャネルアクセストークンと、現在デプロイ済みの
-- リッチメニューIDを保持する。トークンは機密情報のため管理画面APIはマスクして返す。
alter table line_settings
  add column messaging_channel_access_token text,
  add column rich_menu_id text;
