#!/usr/bin/env bash
set -euo pipefail

# 千ノ国パスポート Phase C-0 PR4(§11 既存データ相当マイグレーション試験)。
#
# scripts/test-migrations.sh(§5.1/5.2)は`supabase db reset`直後の空DBに対して
# duplicate-checks.sqlを実行するため、重複0件は自明にしかならない(既知の限界として
# 同スクリプト内にコメント済み)。本スクリプトは呼び出し元が`supabase db reset`済みの
# DBに対して「既存データ相当」のフィクスチャ(tests/migrations/fixtures/pre_phase_c0.sql)
# を投入した上で、同じduplicate-checks.sqlを再実行し、複数行・複数キーが存在する状態でも
# 重複検出クエリが誤検知しないことを確認する。

if [ -z "${DATABASE_TEST_URL:-}" ]; then
  echo "[run-preflight] DATABASE_TEST_URL is not set. Skipping (expected outside a Supabase local environment)."
  exit 0
fi

case "$DATABASE_TEST_URL" in
  *127.0.0.1*|*localhost*) ;;
  *)
    echo "[run-preflight] DATABASE_TEST_URL does not point to a local host. Refusing to run against a non-local database." >&2
    exit 1
    ;;
esac

if ! command -v psql >/dev/null 2>&1; then
  echo "[run-preflight] psql is not installed. Skipping." >&2
  exit 0
fi

echo "[run-preflight] Loading existing-data-equivalent fixture (tests/migrations/fixtures/pre_phase_c0.sql)..."
psql "$DATABASE_TEST_URL" -v ON_ERROR_STOP=1 -f tests/migrations/fixtures/pre_phase_c0.sql

echo "[run-preflight] Re-running duplicate-check queries against the seeded (non-empty) database..."
psql "$DATABASE_TEST_URL" -v ON_ERROR_STOP=1 -f tests/migrations/duplicate-checks.sql

echo "[run-preflight] OK (no output above the final line means zero duplicates were found)"
