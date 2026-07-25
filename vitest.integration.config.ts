import path from "path";
import { defineConfig } from "vitest/config";

// 千ノ国パスポート Phase C-0。Supabase local(実DB)接続を前提とするテストのみを対象とする。
// DATABASE_TEST_URL等が未設定の場合、各テストファイル側でスキップする
// (tests/integration/support/env.tsのrequireTestDatabase()参照)。
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // 並行実行テスト自体が「同一DB状態への複数リクエスト」を検証するため、
    // テストファイル同士は直列実行にしてDB状態の衝突を避ける。
    fileParallelism: false,
  },
});
