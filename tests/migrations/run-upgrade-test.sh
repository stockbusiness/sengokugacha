#!/usr/bin/env bash
set -euo pipefail

# 千ノ国パスポート PR #147マージ前最終修正指示§3。
#
# scripts/test-migrations.sh(§5.1)は`supabase db reset`で空DBへ全マイグレーションを
# 適用するのみで、「PR #147以前の状態(commit f76b373)まで運用していた既存DB」に対して
# PR #147の新規マイグレーションだけを追加適用する、実際のアップグレード経路を検証して
# いなかった。本スクリプトは、Supabase local(migration-test/integration-testジョブが
# `supabase start`で既に用意している同一Postgresクラスタ)内に使い捨てのデータベースを
# 新規作成し、
#
#   1. f76b373時点の67マイグレーションまでを適用
#   2. 既存データ相当フィクスチャ(fixtures/pre_pr147_baseline.sql)を投入
#   3. 適用前の状態をスナップショット
#   4. PR #147の新規7マイグレーションを適用
#   5. 行数/PK/FK/status維持・nullable列補完・check制約置換・重複・orphan・
#      EXECUTE権限・関数置換(既存データに対する新ロジックの実地適用)を検証
#
# という手順を実行する。使い捨てDBはテスト終了後(成功・失敗いずれの場合も)必ず
# DROPする。

if [ -z "${DATABASE_TEST_URL:-}" ]; then
  echo "[run-upgrade-test] DATABASE_TEST_URL is not set. Skipping (expected outside a Supabase local environment)."
  exit 0
fi

case "$DATABASE_TEST_URL" in
  *127.0.0.1*|*localhost*) ;;
  *)
    echo "[run-upgrade-test] DATABASE_TEST_URL does not point to a local host. Refusing to run against a non-local database." >&2
    exit 1
    ;;
esac

if ! command -v psql >/dev/null 2>&1; then
  echo "[run-upgrade-test] psql is not installed. Skipping." >&2
  exit 0
fi

# DATABASE_TEST_URLの末尾のDB名部分だけを使い捨てDB名に置き換える
# (例: postgresql://postgres:postgres@127.0.0.1:54322/postgres
#      -> postgresql://postgres:postgres@127.0.0.1:54322/upgrade_migration_test)。
BASE_URL="${DATABASE_TEST_URL%/*}"
UPGRADE_TEST_DB="upgrade_migration_test"
UPGRADE_TEST_URL="${BASE_URL}/${UPGRADE_TEST_DB}"

MIGRATIONS_DIR="supabase/migrations"
BASELINE_CUTOFF="20260809000003_fix_entitlement_grant_premature_revoked_block.sql"

cleanup() {
  echo "[run-upgrade-test] Cleaning up: dropping database ${UPGRADE_TEST_DB}..."
  psql "$DATABASE_TEST_URL" -v ON_ERROR_STOP=1 -c "drop database if exists ${UPGRADE_TEST_DB} with (force);" >/dev/null 2>&1 || \
    psql "$DATABASE_TEST_URL" -v ON_ERROR_STOP=1 -c "drop database if exists ${UPGRADE_TEST_DB};" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[run-upgrade-test] Creating throwaway database ${UPGRADE_TEST_DB}..."
psql "$DATABASE_TEST_URL" -v ON_ERROR_STOP=1 -c "drop database if exists ${UPGRADE_TEST_DB};"
psql "$DATABASE_TEST_URL" -v ON_ERROR_STOP=1 -c "create database ${UPGRADE_TEST_DB};"

echo "[run-upgrade-test] Stubbing storage schema (supabase-managed, not present on a freshly created database)..."
psql "$UPGRADE_TEST_URL" -v ON_ERROR_STOP=1 <<'EOF'
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb);
EOF

echo "[run-upgrade-test] Applying baseline migrations (up to ${BASELINE_CUTOFF}, commit f76b373)..."
for f in $(ls "$MIGRATIONS_DIR"/*.sql | xargs -n1 basename | sort); do
  psql "$UPGRADE_TEST_URL" -v ON_ERROR_STOP=1 -f "$MIGRATIONS_DIR/$f" >/dev/null
  if [ "$f" = "$BASELINE_CUTOFF" ]; then
    break
  fi
done

echo "[run-upgrade-test] Loading existing-data-equivalent fixture (baseline schema)..."
psql "$UPGRADE_TEST_URL" -v ON_ERROR_STOP=1 -f tests/migrations/fixtures/pre_pr147_baseline.sql

echo "[run-upgrade-test] Recording before-upgrade snapshot..."
psql "$UPGRADE_TEST_URL" -v ON_ERROR_STOP=1 -f tests/migrations/upgrade-snapshot-before.sql

echo "[run-upgrade-test] Applying PR #147's new migrations on top of existing data..."
FOUND_CUTOFF=false
for f in $(ls "$MIGRATIONS_DIR"/*.sql | xargs -n1 basename | sort); do
  if [ "$FOUND_CUTOFF" = false ]; then
    if [ "$f" = "$BASELINE_CUTOFF" ]; then
      FOUND_CUTOFF=true
    fi
    continue
  fi
  echo "[run-upgrade-test]   -> $f"
  psql "$UPGRADE_TEST_URL" -v ON_ERROR_STOP=1 -f "$MIGRATIONS_DIR/$f" >/dev/null
done

echo "[run-upgrade-test] Verifying existing data survived the upgrade intact..."
psql "$UPGRADE_TEST_URL" -v ON_ERROR_STOP=1 -f tests/migrations/upgrade-verify-after.sql

echo "[run-upgrade-test] OK"
