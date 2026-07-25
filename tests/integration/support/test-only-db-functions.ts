import { execFileSync } from "node:child_process";
import { requireLocalTestUrl } from "./env";

// 千ノ国パスポート Phase C-0 PR4 マージ前最終修正指示§2。
//
// entitlement rollbackテスト専用のDB関数(_test_only_force_fail_after_entitlement_
// application_claim / _reversal_claim)は、以前は通常のsupabase/migrations/配下の
// マイグレーションとして追加していたため、本番・ステージングDBにも(呼ばれることは
// 無いとはいえ)そのまま残ってしまっていた。これをテスト実行時にテストDBへ動的に
// 作成し、テスト終了時に必ずDROPする方式へ変更する。
//
// supabase-js(PostgREST経由)には任意のDDLを実行する手段が無いため、Supabase local/
// CIの`migration-test`/`integration-test`ジョブが元々前提としているpsql(GitHub-hosted
// runnerには標準で同梱)を使い、DATABASE_TEST_URL(直接のPostgres接続文字列、
// service_roleではなくpostgresロールで接続される)に対してDDLを実行する。
// 本番/ステージングへの誤適用を防ぐため、他のテストヘルパーと同じrequireLocalTestUrl()
// でホストを検証してから実行する。

const CREATE_SQL = `
create or replace function _test_only_force_fail_after_entitlement_application_claim(
  p_entitlement_row_id uuid
) returns void as $$
declare
  v_claim record;
begin
  select * into v_claim from claim_entitlement_application(p_entitlement_row_id);
  if v_claim.claim_outcome <> 'claimed' then
    raise exception 'claim_entitlement_applicationがclaimedを返しませんでした: %', v_claim.claim_outcome;
  end if;
  raise exception 'intentional test failure after application claim';
end;
$$ language plpgsql;

create or replace function _test_only_force_fail_after_entitlement_reversal_claim(
  p_entitlement_row_id uuid
) returns void as $$
declare
  v_claim record;
begin
  select * into v_claim from claim_entitlement_reversal(p_entitlement_row_id);
  if v_claim.claim_outcome <> 'claimed' then
    raise exception 'claim_entitlement_reversalがclaimedを返しませんでした: %', v_claim.claim_outcome;
  end if;
  raise exception 'intentional test failure after reversal claim';
end;
$$ language plpgsql;
`;

const DROP_SQL = `
drop function if exists _test_only_force_fail_after_entitlement_application_claim(uuid);
drop function if exists _test_only_force_fail_after_entitlement_reversal_claim(uuid);
`;

function getLocalDatabaseUrl(): string {
  const url = process.env.DATABASE_TEST_URL;
  if (!url) {
    throw new Error("DATABASE_TEST_URLが設定されていません(rollbackテスト専用DB関数の作成にはpsql直接接続が必要)。");
  }
  requireLocalTestUrl(url);
  return url;
}

function runPsql(sql: string): void {
  const url = getLocalDatabaseUrl();
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "pipe" });
}

export function createEntitlementRollbackTestHelpers(): void {
  runPsql(CREATE_SQL);
}

export function dropEntitlementRollbackTestHelpers(): void {
  runPsql(DROP_SQL);
}

// マージ前最終修正指示§6。20260809000009で設定したdefault privileges
// (`alter default privileges in schema public revoke/grant execute on functions ...`)
// が、既存関数だけでなく「今後追加される関数」にも自動的に適用されることを確認する。
// 新規関数を動的に1つ作成し、明示的なGRANT/REVOKEを一切行わずにhas_function_privilege()
// を確認した上で、必ずDROPして後始末する。
const FUTURE_FUNCTION_NAME = "_test_only_future_function_default_privileges_check";

function runPsqlQuery(sql: string): string {
  const url = getLocalDatabaseUrl();
  const out = execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql], { stdio: ["ignore", "pipe", "pipe"] });
  return out.toString("utf-8").trim();
}

export function createFutureFunctionForDefaultPrivilegesCheck(): void {
  runPsql(`create or replace function ${FUTURE_FUNCTION_NAME}() returns void as $$ begin end; $$ language plpgsql;`);
}

export function dropFutureFunctionForDefaultPrivilegesCheck(): void {
  runPsql(`drop function if exists ${FUTURE_FUNCTION_NAME}();`);
}

export function checkFutureFunctionExecutePrivilege(role: "anon" | "authenticated" | "service_role"): boolean {
  const result = runPsqlQuery(
    `select has_function_privilege('${role}', '${FUTURE_FUNCTION_NAME}()', 'EXECUTE');`
  );
  return result === "t";
}
