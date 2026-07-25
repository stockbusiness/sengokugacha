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
    // 各テストファイルがnext devを子プロセスとして起動する(tests/contracts/support/server.ts)。
    // 複数ファイルを並列実行すると、同一プロジェクトディレクトリ(同じ.nextキャッシュ)に対して
    // 複数のnext devが同時に起動しようとして競合し、起動待ちがタイムアウトする
    // (PR #147でファイルを追加した際に実地確認)。ファイル間は直列実行にする。
    fileParallelism: false,
  },
});
