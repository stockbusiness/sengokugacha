import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

// 千ノ国パスポート Phase C-0(§14 API Contractテスト)。
// next dev を子プロセスとして起動し、HTTPレベルでAPI Routeの契約(ステータス・
// レスポンス形式)を検証するための最小限のテストサーバーを提供する。
// DBに依存しない認証ゲート(401/403/missing_headers等)の検証はこのサーバーだけで
// 完結する(実際にこのセッションで起動・curl確認済み)。DBアクセスを要する経路
// (正常系の実処理)はSUPABASE_TEST_URL等が設定された環境でのみ意味を持つ。
//
// 注意: next dev(Next.js 16)はtsconfig.jsonのincludeへ型生成パスを自動追記する
// ことがある(このセッションで実際に発生・確認済み)。test:contracts実行後は
// `git status`でtsconfig.jsonへの意図しない変更が無いか確認すること。

export const TEST_SESSION_SECRET = "test-contract-session-secret";

export interface TestServer {
  baseUrl: string;
  stop: () => Promise<void>;
}

async function waitForReady(baseUrl: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      // 認証チェックがDBに依存しないエンドポイントへのリクエストで起動完了を判定する
      // (トップページのコンパイル待ちより早く、かつ契約テスト対象と同じ経路で確認できる)。
      const res = await fetch(`${baseUrl}/api/admin/integration-outbox/drain`, { method: "POST" });
      if (res.status === 401) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`テストサーバーが起動しませんでした: ${String(lastError)}`);
}

function killProcessTree(child: ChildProcess): void {
  // `npx next dev`はnpx自体とnextの2階層になり、npxプロセスだけをkillしても
  // 子のnextプロセスが残留する(このセッションで実際に発生・確認済み)。
  // detached:trueでプロセスグループを分離しておき、グループ全体へシグナルを送る。
  if (typeof child.pid !== "number") return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

export async function startTestServer(port: number): Promise<TestServer> {
  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child: ChildProcess = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SESSION_SECRET: TEST_SESSION_SECRET,
      NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_TEST_URL ?? "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "dummy",
      ADMIN_PASSWORD: "dummy-admin-password-for-contract-tests",
    },
    stdio: "pipe",
    detached: true,
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForReady(baseUrl);
  } catch (error) {
    killProcessTree(child);
    throw error;
  }

  return {
    baseUrl,
    stop: async () => {
      killProcessTree(child);
      await new Promise((resolve) => setTimeout(resolve, 200));
    },
  };
}
