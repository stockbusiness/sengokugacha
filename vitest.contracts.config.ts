import path from "path";
import { defineConfig } from "vitest/config";

// 千ノ国パスポート Phase C-0。API Contractテスト(§14)専用config。
// 実行中のNext.jsサーバー(TEST_APP_URL)+ Supabase local(実DB)を前提とする。
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/contracts/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
