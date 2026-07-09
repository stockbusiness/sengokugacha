-- 戦国パスポート Ver2.2: AI寺子屋・マーケット・イベント導線統合フェーズ。
-- 既存の外部送客リンク管理(external_links)をそのまま活用し、
-- イベント予約用のリンクキーのみ最小差分で追加する。
-- AI寺子屋(ai_art_school)・NFTマーケット(nft_marketplace)・
-- 建国メンバー募集(nation_builder_program)は既存のキーをそのまま利用する。

insert into external_links (key, label, url) values
  ('event_reservation', 'イベント予約', null)
on conflict (key) do nothing;
