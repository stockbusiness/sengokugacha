import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { adminCookieHeader, signAdminSessionToken } from "./support/admin-jwt";
import { startTestServer, type TestServer } from "./support/server";

// 千ノ国パスポート Phase C-0 PR4(§3.2 管理画面再実行)。
// POST /api/admin/purchases/[id]/retry-grantを2並列で叩き、'failed'→'retrying'への
// 原子的な遷移(20260807000002)により片方だけが実処理へ進み、他方は409になることを
// 実際のNext.jsサーバー+Supabase local(実DB)で確認する。

const TEST_PORT = 39218;
const hasTestDatabase = Boolean(process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(TEST_PORT);
}, 60000);

afterAll(async () => {
  await server.stop();
});

describe.skipIf(!hasTestDatabase)("POST /api/admin/purchases/[id]/retry-grant(DB接続あり、2並列)", () => {
  const createdUserIds: string[] = [];
  const createdPurchaseIds: string[] = [];

  function supabase() {
    return createClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!);
  }

  afterEach(async () => {
    const client = supabase();
    for (const purchaseId of createdPurchaseIds.splice(0)) {
      await client.from("purchase_grant_steps").delete().eq("purchase_id", purchaseId);
      await client.from("agent_sales").delete().eq("purchase_id", purchaseId);
      await client.from("purchases").delete().eq("id", purchaseId);
    }
    for (const userId of createdUserIds.splice(0)) {
      await client.from("users").delete().eq("id", userId);
    }
  });

  it("manager 2並列では片方だけ実行され、他方は409になり残高は1回分だけ加算される", async () => {
    const client = supabase();
    const { data: user, error: userError } = await client
      .from("users")
      .insert({
        line_user_id: `test-line-user-${crypto.randomUUID()}`,
        display_name: "テストユーザー",
        kokudaka: 0,
        gacha_tickets: 0,
      })
      .select("id")
      .single();
    if (userError) throw userError;
    createdUserIds.push(user.id as string);

    const { data: purchase, error: purchaseError } = await client
      .from("purchases")
      .insert({
        user_id: user.id,
        stripe_session_id: `test-session-${crypto.randomUUID()}`,
        item_type: "kokudaka",
        amount: 1000,
        grant_amount: 500,
        status: "processing",
        grant_status: "failed",
      })
      .select("id")
      .single();
    if (purchaseError) throw purchaseError;
    createdPurchaseIds.push(purchase.id as string);

    const token = await signAdminSessionToken("manager");
    const cookie = adminCookieHeader(token);

    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        fetch(`${server.baseUrl}/api/admin/purchases/${purchase.id}/retry-grant`, {
          method: "POST",
          headers: { Cookie: cookie },
        })
      )
    );
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);

    const { data: userAfter, error: userAfterError } = await client
      .from("users")
      .select("kokudaka")
      .eq("id", user.id)
      .single();
    if (userAfterError) throw userAfterError;
    expect(userAfter.kokudaka).toBe(500);

    const { data: purchaseAfter, error: purchaseAfterError } = await client
      .from("purchases")
      .select("grant_status, status")
      .eq("id", purchase.id)
      .single();
    if (purchaseAfterError) throw purchaseAfterError;
    expect(purchaseAfter.grant_status).toBe("granted");
    expect(purchaseAfter.status).toBe("completed");
  });

  it("operatorロールは403(既存のContractテストと同じ財務影響ガードだが、実行結果まで確認する)", async () => {
    const client = supabase();
    const { data: user, error: userError } = await client
      .from("users")
      .insert({
        line_user_id: `test-line-user-${crypto.randomUUID()}`,
        display_name: "テストユーザー",
        kokudaka: 0,
      })
      .select("id")
      .single();
    if (userError) throw userError;
    createdUserIds.push(user.id as string);

    const { data: purchase, error: purchaseError } = await client
      .from("purchases")
      .insert({
        user_id: user.id,
        stripe_session_id: `test-session-${crypto.randomUUID()}`,
        item_type: "kokudaka",
        amount: 1000,
        grant_amount: 500,
        status: "processing",
        grant_status: "failed",
      })
      .select("id")
      .single();
    if (purchaseError) throw purchaseError;
    createdPurchaseIds.push(purchase.id as string);

    const token = await signAdminSessionToken("operator");
    const res = await fetch(`${server.baseUrl}/api/admin/purchases/${purchase.id}/retry-grant`, {
      method: "POST",
      headers: { Cookie: adminCookieHeader(token) },
    });
    expect(res.status).toBe(403);

    const { data: purchaseAfter, error: purchaseAfterError } = await client
      .from("purchases")
      .select("grant_status")
      .eq("id", purchase.id)
      .single();
    if (purchaseAfterError) throw purchaseAfterError;
    expect(purchaseAfter.grant_status).toBe("failed"); // 403でブロックされ状態は変化しない
  });
});
