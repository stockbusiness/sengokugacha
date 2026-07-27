-- 千ノ国パスポート Phase C-1 ステージング適用中に実地確認で発覚した重大な抜け。
--
-- 20260809000009・20260810000002はいずれも「PUBLICロールからEXECUTE剥奪」のみを行っていた。
-- しかしSupabaseプロジェクトは初期設定として、public スキーマに対し
--   alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
-- というSupabase自身のブートストラップ権限ルールを持つ(PostgRESTが素の関数呼び出しを
-- 行える前提の既定設計で、RLS/関数内部のガードを実質的な境界とする思想)。これは
-- PUBLICロールとは独立した、anon/authenticatedを名指しした別のACLエントリのため、
-- 「PUBLICから剥奪」は一切ここに効かない。
--
-- ローカル検証(PR #147・Phase C-0)はSupabase独自のブートストラップを持たない素の
-- PostgreSQL 16コンテナで実施していたため、この抜けが再現されず見逃されていた。
-- 実際のSupabaseステージングDBへ適用した際に、20260809000009・20260810000002適用後も
-- adjust_user_balance・execute_gacha_draw等の重要関数がanon/authenticatedから
-- 実行可能なままであることが確認された。
--
-- anon/authenticatedを名指しで剥奪し、default privilegesも同様に修正する。
revoke execute on all functions in schema public from anon, authenticated, public;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke execute on functions from anon, authenticated, public;
alter default privileges in schema public grant execute on functions to service_role;

-- event trigger本体も同じ抜けを持っていたため、anon/authenticatedを明示的に対象へ追加する。
create or replace function _lock_down_new_public_functions()
returns event_trigger
language plpgsql
as $$
declare
  obj record;
begin
  for obj in
    select object_identity
    from pg_event_trigger_ddl_commands()
    where object_type = 'function' and schema_name = 'public'
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', obj.object_identity);
    execute format('grant execute on function %s to service_role', obj.object_identity);
  end loop;
end;
$$;

revoke execute on function _lock_down_new_public_functions() from anon, authenticated, public;
grant execute on function _lock_down_new_public_functions() to service_role;
