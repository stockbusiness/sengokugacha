#!/usr/bin/env bash
set -euo pipefail

# 千ノ国パスポート Phase C-0(§5 マイグレーションテスト)。
#
# DATABASE_TEST_URLが未設定の環境(Supabase local未起動、または本番/ステージング
# しか到達できない環境)では、誤って本番相当DBへ適用してしまうことを避けるため、
# 何もせず正常終了する(失敗として扱わない)。
# Supabase local起動自体はDockerを必要とするため、Dockerレジストリへのアクセスが
# 制限された環境ではこのスクリプトを実行する前段(`supabase start`)が実行できない。

if [ -z "${DATABASE_TEST_URL:-}" ]; then
  echo "[test-migrations] DATABASE_TEST_URL is not set. Skipping (expected outside a Supabase local environment)."
  exit 0
fi

case "$DATABASE_TEST_URL" in
  *127.0.0.1*|*localhost*) ;;
  *)
    echo "[test-migrations] DATABASE_TEST_URL does not point to a local host. Refusing to run against a non-local database." >&2
    exit 1
    ;;
esac

if ! command -v psql >/dev/null 2>&1; then
  echo "[test-migrations] psql is not installed. Skipping." >&2
  exit 0
fi

# `supabase start`(このスクリプトの前段)が起動時に既にsupabase/migrations配下の
# 全マイグレーション+seed.sqlをローカルDBへ適用済みのため、ここで素のpsqlループで
# 同じ内容を再適用すると「relation already exists」等で失敗する。§5.1が検証したい
# 「空のDBへ全マイグレーションを順番に適用できること」は`supabase db reset`が
# 改めてスキーマを空の状態に戻してから同じ手順を踏むため、それを使う。
if command -v supabase >/dev/null 2>&1; then
  echo "[test-migrations] Applying all migrations to an empty database via 'supabase db reset' (§5.1)..."
  supabase db reset
else
  echo "[test-migrations] supabase CLI is not installed. Skipping (expected outside a Supabase local environment)." >&2
  exit 0
fi

echo "[test-migrations] Running duplicate-check queries against the empty database (§5.2)..."
psql "$DATABASE_TEST_URL" -v ON_ERROR_STOP=1 -f tests/migrations/duplicate-checks.sql

# 千ノ国パスポート Phase C-0 PR4(§11)。上記は空DBに対する実行のため重複0件が自明にしか
# ならない。既存データ相当のフィクスチャを投入した上での意味のある実行はrun-preflight.shへ
# 委譲する(§5.1のsupabase db resetで作られた、いま適用済みのスキーマに追記する形で行う)。
echo "[test-migrations] Running the existing-data-equivalent migration preflight (§11, tests/migrations/run-preflight.sh)..."
bash tests/migrations/run-preflight.sh

# 千ノ国パスポート PR #147マージ前最終修正指示§3。上記はいずれも「空DBへ全マイグレーション
# を適用する」経路のみを検証しており、「既存の(PR #147以前の)DBへPR #147の新規
# マイグレーションだけを追加適用する」実際のアップグレード経路は未検証だった。
echo "[test-migrations] Running the real upgrade migration test (§3, tests/migrations/run-upgrade-test.sh)..."
bash tests/migrations/run-upgrade-test.sh

echo "[test-migrations] OK"
