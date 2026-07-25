#!/usr/bin/env bash
set -euo pipefail

# 千ノ国パスポート Phase C-0(§6-9, §11 並行実行テスト)。
#
# 並行実行テスト本体はtests/integration/配下のvitestテスト(supabase-jsクライアントで
# 各PostgreSQL関数を10/20並列呼び出しする)として実装している(test:integration相当)。
# 本スクリプトは、CI・ローカルの双方から同じ入口(`npm run test:concurrency`相当)で
# 並行実行系のテストだけを狙って再実行できるようにする薄いラッパーである。
#
# SUPABASE_TEST_URL/SUPABASE_TEST_SERVICE_ROLE_KEYが未設定の環境ではスキップする。

if [ -z "${SUPABASE_TEST_URL:-}" ] || [ -z "${SUPABASE_TEST_SERVICE_ROLE_KEY:-}" ]; then
  echo "[test-concurrency] SUPABASE_TEST_URL/SUPABASE_TEST_SERVICE_ROLE_KEY is not set. Skipping (expected outside a Supabase local environment)."
  exit 0
fi

npx vitest run --config vitest.integration.config.ts \
  tests/integration/purchase-grant-step-concurrency.test.ts \
  tests/integration/entitlement-concurrency.test.ts \
  tests/integration/stripe-inbox-concurrency.test.ts \
  tests/integration/integration-inbox-concurrency.test.ts \
  tests/integration/gacha-concurrency.test.ts
