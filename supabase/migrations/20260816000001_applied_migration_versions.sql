-- staging/本番への適用漏れを検知するための読み取り関数。
--
-- 背景: このリポジトリのマイグレーションは手動適用運用で、SQLを流したうえで
-- supabase_migrations.schema_migrations へ手でINSERTして履歴を合わせている
-- (docs/PHASE_C1_MIGRATION_HISTORY_REPAIR_PLAN.md)。
-- CIの migration-test は毎回まっさらなDBへ全件を順に適用するため、
-- 「stagingで1本飛ばした」という状態は構造上検知できない。
--
-- 実際に 20260814000001 の適用が漏れ、コードだけが先に本番へ出て
-- 相談申込・相談状況ページ・管理画面の問い合わせ一覧が動かない状態が発生した。
-- 同じ事故を防ぐため、適用済みバージョンを読み出して
-- /admin/operations-health でリポジトリ側の一覧と突き合わせられるようにする。
--
-- supabase_migrations スキーマはPostgRESTのAPIに公開されていないため
-- supabase.from() では読めない。public スキーマの関数を1本置いて .rpc() から呼ぶ
-- (reconciliation_snapshot() と同じ方針)。

-- schema_migrations への読み取り権限。Supabase CLIが作るスキーマなので、
-- 万一存在しない環境でもマイグレーション自体は失敗させない。
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'supabase_migrations') then
    execute 'grant usage on schema supabase_migrations to service_role';
    execute 'grant select on supabase_migrations.schema_migrations to service_role';
  end if;
end $$;

-- 本文を動的SQLにしているのは、関数の作成時点で対象テーブルの存在を要求しないため。
-- 読めない環境では呼び出し時にエラーになり、呼び出し側(TypeScript)が
-- 「確認できませんでした」として扱う(「全件未適用」と誤検知させない)。
create or replace function applied_migration_versions()
returns table (version text)
language plpgsql
stable
as $$
begin
  return query execute
    'select version::text from supabase_migrations.schema_migrations order by version';
end;
$$;

comment on function applied_migration_versions() is
  '適用済みマイグレーションのversion一覧。/admin/operations-health がリポジトリ側の一覧と突き合わせて適用漏れを検知するために使う。';
