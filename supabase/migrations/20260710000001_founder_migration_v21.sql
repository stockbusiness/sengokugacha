-- 戦国パスポート Ver2.1: 創設メンバー移行・建国メンバー導線フェーズ。
-- 創設メンバー/建国メンバーの主要フィールドは Ver2.0(20260709000006)で追加済み。
-- 本マイグレーションは「国家開発区画」表現に必要な残りの列と、
-- 建国メンバー導線用の外部送客リンクのみを追加する。

alter table users
  add column development_area text,
  add column development_plot_status text not null default 'preparing'
    check (development_plot_status in ('preparing', 'nation_building', 'metaverse_pending', 'priority', 'confirming'));

-- 既存の外部送客リンク管理(external_links)をそのまま活用する。
-- URLは未設定のまま追加し、管理画面(/admin/links)からLP等のURLを設定してもらう想定。
insert into external_links (key, label, url) values
  ('nation_builder_program', '建国メンバー募集', null)
on conflict (key) do nothing;
