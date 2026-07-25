import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

// 千ノ国パスポート Phase C-0(§4 Supabase local環境)。
// DB統合テストは、SUPABASE_TEST_URL/SUPABASE_TEST_SERVICE_ROLE_KEYが設定されている
// (=Supabase localが起動している)場合にのみ実行する。未設定の環境(このリポジトリの
// 開発用サンドボックス等、Dockerレジストリへのアクセスが制限された環境を含む)では
// テストを「失敗」ではなく「スキップ」として扱い、本番/ステージングへの誤接続を防ぐ。
//
// 本番用の環境変数(SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY等)は意図的に参照しない。

export function hasIntegrationTestDatabase(): boolean {
  return Boolean(process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);
}

export function requireLocalTestUrl(url: string): void {
  const isLocal = url.includes("127.0.0.1") || url.includes("localhost");
  if (!isLocal) {
    throw new Error(
      `SUPABASE_TEST_URL(${url})がlocalhost/127.0.0.1を指していません。本番/ステージングへの誤接続を防ぐため中断します。`
    );
  }
}

let cachedClient: SupabaseClient | null = null;

export function getTestSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_TEST_URL;
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_TEST_URL/SUPABASE_TEST_SERVICE_ROLE_KEYが設定されていません。");
  }
  requireLocalTestUrl(url);
  if (!cachedClient) {
    cachedClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cachedClient;
}

export function getTestAnonSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_TEST_URL;
  const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("SUPABASE_TEST_URL/SUPABASE_TEST_ANON_KEYが設定されていません。");
  }
  requireLocalTestUrl(url);
  return createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

// 千ノ国パスポート Phase C-0 PR4(§12 RLS追加試験)。このアプリはSupabase Authを
// 使わない(LINEログイン+独自セッション)ため、実在するauthenticatedユーザーが
// 存在しない。Supabase CLIはconfig.tomlでauth.jwt_secretを明示的に上書きしない限り、
// ローカル開発専用の既知のデフォルト値("super-secret-jwt-token-with-at-least-
// 32-characters-long")でJWTを署名する(本番プロジェクトは必ず固有のランダムな
// シークレットを使うため、この値が本番で使われることはない)。本番/ステージングへの
// 誤接続はrequireLocalTestUrl()で別途防止済みのため、ローカルSupabase専用の
// 既知の値をテストでも使い、role="authenticated"のJWTを自前で組み立てて検証する。
const SUPABASE_LOCAL_DEFAULT_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";

export async function getTestAuthenticatedSupabaseClient(userId: string = crypto.randomUUID()): Promise<SupabaseClient> {
  const url = process.env.SUPABASE_TEST_URL;
  if (!url) {
    throw new Error("SUPABASE_TEST_URLが設定されていません。");
  }
  requireLocalTestUrl(url);
  const secret = new TextEncoder().encode(SUPABASE_LOCAL_DEFAULT_JWT_SECRET);
  const token = await new SignJWT({ role: "authenticated", sub: userId, aud: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("3600s")
    .sign(secret);
  return createClient(url, token, { auth: { autoRefreshToken: false, persistSession: false } });
}

// テスト用ユーザー・購入等のfixtureを作成するための共通ヘルパー。
// テスト終了後は各テストファイルのafterEach/afterAllでdeleteし、DBに痕跡を残さない
// (§4「テスト終了後にデータを残さない」)。
export async function createTestUser(overrides: Record<string, unknown> = {}): Promise<string> {
  const client = getTestSupabaseClient();
  const { data, error } = await client
    .from("users")
    .insert({
      line_user_id: `test-line-user-${crypto.randomUUID()}`,
      display_name: "テストユーザー",
      kokudaka: 0,
      gacha_tickets: 0,
      contribution_points: 0,
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteTestUser(userId: string): Promise<void> {
  const client = getTestSupabaseClient();
  await client.from("users").delete().eq("id", userId);
}
