import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { adminCookieHeader, signAdminSessionToken } from "./support/admin-jwt";
import { startTestServer, type TestServer } from "./support/server";

// 千ノ国パスポート Phase C-0 PR4(§10 API Contract正常系追加)。
// api-contracts.test.tsではDBに依存しない認証ゲート(401/403)のみを確認しているため、
// ここでは実際に処理が完了する正常系(response shape・DB反映)をDB接続込みで確認する。
// integration-outbox/drainは外部ホスト(sengoku-ai.com/LINE API)への実送信を伴うため、
// 本番相当のトラフィックを発生させないよう「対象0件」時のレスポンス形状のみを確認する
// (実際のclaim/mark原子性はtests/integration/outbox-concurrency.test.tsで検証済み)。

const TEST_PORT = 39221;
const hasTestDatabase = Boolean(process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(TEST_PORT);
}, 60000);

afterAll(async () => {
  await server.stop();
});

function supabase() {
  return createClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!);
}

describe.skipIf(!hasTestDatabase)("POST /api/admin/entitlements/retry-resolve(DB接続あり)", () => {
  const createdUserIds: string[] = [];
  const createdEntitlementIds: string[] = [];

  afterEach(async () => {
    const client = supabase();
    for (const id of createdEntitlementIds.splice(0)) {
      await client.from("entitlements").delete().eq("id", id);
    }
    for (const userId of createdUserIds.splice(0)) {
      await client.from("users").delete().eq("id", userId);
    }
  });

  it("manager: user_id未解決のentitlementがcommon_user_id一致で再解決され、残高が付与される", async () => {
    const client = supabase();
    const commonUserId = `common-${crypto.randomUUID()}`;

    const { data: entitlement, error: entitlementError } = await client
      .from("entitlements")
      .insert({
        entitlement_id: `ent-${crypto.randomUUID()}`,
        common_user_id: commonUserId,
        user_id: null,
        entitlement_type: "kokudaka",
        quantity: 150,
        source_system_key: "test-system",
      })
      .select("id")
      .single();
    if (entitlementError) throw entitlementError;
    createdEntitlementIds.push(entitlement.id as string);

    const { data: user, error: userError } = await client
      .from("users")
      .insert({ line_user_id: `test-line-user-${crypto.randomUUID()}`, display_name: "テストユーザー", common_user_id: commonUserId, kokudaka: 0 })
      .select("id")
      .single();
    if (userError) throw userError;
    createdUserIds.push(user.id as string);

    const token = await signAdminSessionToken("manager");
    const res = await fetch(`${server.baseUrl}/api/admin/entitlements/retry-resolve`, {
      method: "POST",
      headers: { Cookie: adminCookieHeader(token) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; retriedCount: number; resolvedCount: number };
    expect(body.ok).toBe(true);
    expect(body.retriedCount).toBeGreaterThanOrEqual(1);
    expect(body.resolvedCount).toBeGreaterThanOrEqual(1);

    const { data: userAfter, error: userAfterError } = await client.from("users").select("kokudaka").eq("id", user.id).single();
    if (userAfterError) throw userAfterError;
    expect(userAfter.kokudaka).toBe(150);

    const { data: entitlementAfter, error: entitlementAfterError } = await client
      .from("entitlements")
      .select("user_id, application_status")
      .eq("id", entitlement.id)
      .single();
    if (entitlementAfterError) throw entitlementAfterError;
    expect(entitlementAfter.user_id).toBe(user.id);
    expect(entitlementAfter.application_status).toBe("applied");
  });
});

describe.skipIf(!hasTestDatabase)("POST /api/admin/integration-outbox/drain(DB接続あり)", () => {
  it("manager: 対象0件でも200・想定通りのresponse shapeを返す", async () => {
    const token = await signAdminSessionToken("manager");
    const res = await fetch(`${server.baseUrl}/api/admin/integration-outbox/drain`, {
      method: "POST",
      headers: { Cookie: adminCookieHeader(token) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      integration: { retried: number; sent: number };
      notification: { retried: number; sent: number };
    };
    expect(body.ok).toBe(true);
    expect(body.integration).toMatchObject({ retried: expect.any(Number), sent: expect.any(Number) });
    expect(body.notification).toMatchObject({ retried: expect.any(Number), sent: expect.any(Number) });
  });
});

describe.skipIf(!hasTestDatabase)("POST /api/integrations/agencies(DB接続あり、common_user_hub正常系)", () => {
  let settingsId: string | undefined;
  const rawApiKey = `spo_test_${crypto.randomUUID()}`;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const client = supabase();
    const { data, error } = await client
      .from("agency_integration_settings")
      .insert({ inbound_api_key_hash: createHash("sha256").update(rawApiKey).digest("hex") })
      .select("id")
      .single();
    if (error) throw error;
    settingsId = data.id as string;
  });

  afterAll(async () => {
    if (!settingsId) return;
    const client = supabase();
    await client.from("agency_integration_settings").delete().eq("id", settingsId);
  });

  afterEach(async () => {
    const client = supabase();
    for (const userId of createdUserIds.splice(0)) {
      await client.from("users").delete().eq("id", userId);
    }
  });

  async function postAgencyEvent(body: Record<string, unknown>) {
    return fetch(`${server.baseUrl}/api/integrations/agencies`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": rawApiKey },
      body: JSON.stringify(body),
    });
  }

  it("common_user.merged: source側のusers.common_user_idがtarget側へ付け替わる", async () => {
    const client = supabase();
    const sourceCommonUserId = `common-source-${crypto.randomUUID()}`;
    const targetCommonUserId = `common-target-${crypto.randomUUID()}`;

    const { data: user, error: userError } = await client
      .from("users")
      .insert({ line_user_id: `test-line-user-${crypto.randomUUID()}`, display_name: "テストユーザー", common_user_id: sourceCommonUserId })
      .select("id")
      .single();
    if (userError) throw userError;
    createdUserIds.push(user.id as string);

    const res = await postAgencyEvent({
      event: "common_user.merged",
      details: { source_common_user_id: sourceCommonUserId, target_common_user_id: targetCommonUserId },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { event: "common_user.merged", processed: true } });

    const { data: userAfter, error: userAfterError } = await client.from("users").select("common_user_id").eq("id", user.id).single();
    if (userAfterError) throw userAfterError;
    expect(userAfter.common_user_id).toBe(targetCommonUserId);
  });

  it("common_user.assigned_agent.updated: users.assigned_agent_idが更新される", async () => {
    const client = supabase();
    const commonUserId = `common-${crypto.randomUUID()}`;
    const agentCode = `test-agent-${crypto.randomUUID()}`;

    const { data: agent, error: agentError } = await client
      .from("agents")
      .insert({ name: "テスト代理店", referral_code: `ref-${crypto.randomUUID()}`, external_id: agentCode })
      .select("id")
      .single();
    if (agentError) throw agentError;

    const { data: user, error: userError } = await client
      .from("users")
      .insert({ line_user_id: `test-line-user-${crypto.randomUUID()}`, display_name: "テストユーザー", common_user_id: commonUserId })
      .select("id")
      .single();
    if (userError) throw userError;
    createdUserIds.push(user.id as string);

    const res = await postAgencyEvent({
      event: "common_user.assigned_agent.updated",
      common_user_id: commonUserId,
      agent_code: agentCode,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { event: "common_user.assigned_agent.updated", processed: true } });

    const { data: userAfter, error: userAfterError } = await client.from("users").select("assigned_agent_id").eq("id", user.id).single();
    if (userAfterError) throw userAfterError;
    expect(userAfter.assigned_agent_id).toBe(agent.id);

    await client.from("agents").delete().eq("id", agent.id);
  });
});
