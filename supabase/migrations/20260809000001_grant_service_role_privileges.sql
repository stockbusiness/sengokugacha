-- 千ノ国パスポート Phase C-0(§5/§15 DB統合テスト)。
--
-- これまでのマイグレーションは「service roleキー経由のみアクセス可能」という前提で
-- RLSを有効化するのみで、publicスキーマへの明示的なGRANTを一度も行っていなかった。
-- 通常のSupabaseプロジェクトではservice_roleロールはBYPASSRLS属性を持ち、かつ
-- デフォルト権限(ALTER DEFAULT PRIVILEGES)によりpublicスキーマの全テーブルへの
-- アクセス権を自動的に得るが、この既定権限は「テーブルを作成したロール」に対して
-- 設定されたものにのみ適用される。GitHub Actions上のSupabase local(§16で初めて
-- 実地確認)でマイグレーションを適用したロールがこの既定権限の対象外だった場合、
-- service_roleキーで接続してもservice_roleロール自体には基本的なテーブル権限が
-- 付与されず、"permission denied for table ..."となる(PR #146のintegration-test
-- で実地確認)。原因のロール構成に依らず動作するよう、ここで明示的にGRANTしておく。

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
