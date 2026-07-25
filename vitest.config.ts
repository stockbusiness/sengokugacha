import path from "path";
import { defineConfig } from "vitest/config";

// 千ノ国パスポート Phase C-0(DB統合テスト・マイグレーション安全化・CI必須化指示書)。
// tests/以下(integration/contracts)はSupabase local(実DB)接続を前提とするため、
// デフォルトのunit test実行(npm test / npm run test:unit)からは除外する。
// それぞれ専用のvitest.integration.config.ts / vitest.contracts.config.tsから実行する。
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "tests/integration/**", "tests/contracts/**"],
  },
});
