-- 千ノ国パスポート PR #147マージ前最終修正指示§6。
--
-- 20260809000009はpublicスキーマの既存関数全てからPUBLICのEXECUTEを剥奪し、
-- default privileges(alter default privileges ... revoke/grant)で「今後追加される
-- 関数にも同じ方針を適用する」ことを意図していた。しかし実地検証の結果、PostgreSQLの
-- default privilegesは関数(function)オブジェクト種別に対しては、PUBLICへの自動
-- EXECUTE付与そのものを抑止できないことが判明した(default privilegesで
-- revoke ... from publicしても、新規にCREATE FUNCTIONされた関数のACLには
-- 依然として"=X"(PUBLIC実行可)が自動的に含まれてしまう。これは複数の独立した
-- 検証用DBで再現した既知のPostgreSQLの挙動であり、本リポジトリ固有のバグではない)。
--
-- 一方、既存関数を`create or replace function`で再定義する場合はACLがそのまま
-- 保持される(PostgreSQLの仕様)ため、20260809000009で一度EXECUTEを剥奪した関数が
-- 後続のマイグレーション(例: 20260810000001)で再定義されても、剥奪状態は失われない
-- ことも確認済み。影響があるのは「これまで一度も存在しなかった、完全に新規の関数」
-- のみである。
--
-- そのため、default privilegesではなくイベントトリガーを使い、publicスキーマに
-- 新規関数が作成されるたびに自動でPUBLICのEXECUTEを剥奪し、service_roleにのみ
-- EXECUTEを付与する。CREATE FUNCTION/CREATE OR REPLACE FUNCTIONのいずれもタグは
-- 'CREATE FUNCTION'になるため、両方を捕捉できる。auth/storage/extensions等の
-- 他スキーマの関数(Supabase自身の内部機構が依存する可能性がある)には一切影響しない
-- よう、schema_name='public'の関数のみを対象にする。

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
    execute format('revoke execute on function %s from public', obj.object_identity);
    execute format('grant execute on function %s to service_role', obj.object_identity);
  end loop;
end;
$$;

drop event trigger if exists lock_down_new_public_functions;
create event trigger lock_down_new_public_functions
  on ddl_command_end
  when tag in ('CREATE FUNCTION')
  execute function _lock_down_new_public_functions();

-- _lock_down_new_public_functions自体は、このトリガーがまだ存在しない時点で
-- 作成されたため(トリガーは自分自身を保護できない)、明示的にPUBLICを剥奪する。
-- なおevent trigger型の関数はPostgres側で直接の関数呼び出しを拒否するため
-- (イベントトリガー機構からしか呼び出せない)実害は無いが、§6の確認項目
-- (「anon/authenticatedは全重要RPC実行不可」)を例外無く満たすために明示する。
revoke execute on function _lock_down_new_public_functions() from public;
grant execute on function _lock_down_new_public_functions() to service_role;
