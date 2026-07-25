import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "./support/server";
import { signV1, signV2 } from "./support/sen-no-kuni-hub";

// 千ノ国パスポート Phase C-0 PR4(§9 HMAC v1/v2統合テスト)。
// POST /api/integrations/sen-no-kuni-hubへ実際に有効なHMAC署名を付けたリクエストを
// 送り、v1/v2それぞれの正常系・改ざん/リプレイ/期限切れ等の拒否系・実イベント処理
// (entitlement.granted/revoked、customer.assignment.changed、order.paid)を検証する。
// missing_headers等のDBに依存しない認証ゲートはapi-contracts.test.tsで確認済みのため
// ここでは対象外とする。

const TEST_PORT = 39220;
const hasTestDatabase = Boolean(process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(TEST_PORT);
}, 60000);

afterAll(async () => {
  await server.stop();
});

describe.skipIf(!hasTestDatabase)("POST /api/integrations/sen-no-kuni-hub(DB接続あり、HMAC v1/v2)", () => {
  const createdSettingsKeyIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdAgentIds: string[] = [];

  function supabase() {
    return createClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!);
  }

  afterEach(async () => {
    const client = supabase();
    for (const keyId of createdSettingsKeyIds.splice(0)) {
      await client.from("sen_no_kuni_hub_used_nonces").delete().eq("key_id", keyId);
      await client.from("sen_no_kuni_hub_settings").delete().eq("key_id", keyId);
    }
    for (const userId of createdUserIds.splice(0)) {
      await client.from("entitlements").delete().eq("user_id", userId);
      await client.from("shopping_order_events").delete().eq("user_id", userId);
      await client.from("users").delete().eq("id", userId);
    }
    for (const agentId of createdAgentIds.splice(0)) {
      await client.from("agents").delete().eq("id", agentId);
    }
  });

  async function createSettings(overrides: Record<string, unknown> = {}) {
    const client = supabase();
    const keyId = `test-key-${crypto.randomUUID()}`;
    const systemKey = `test-system-${crypto.randomUUID()}`;
    const secret = `test-secret-${crypto.randomUUID()}`;
    const { error } = await client.from("sen_no_kuni_hub_settings").insert({
      system_key: systemKey,
      key_id: keyId,
      hmac_secret: secret,
      enabled: true,
      ...overrides,
    });
    if (error) throw error;
    createdSettingsKeyIds.push(keyId);
    return { keyId, systemKey, secret };
  }

  async function createUserWithCommonUserId() {
    const client = supabase();
    const commonUserId = `common-${crypto.randomUUID()}`;
    const { data, error } = await client
      .from("users")
      .insert({
        line_user_id: `test-line-user-${crypto.randomUUID()}`,
        display_name: "テストユーザー",
        common_user_id: commonUserId,
        kokudaka: 0,
      })
      .select("id")
      .single();
    if (error) throw error;
    createdUserIds.push(data.id as string);
    return { userId: data.id as string, commonUserId };
  }

  async function post(rawBody: string, headers: Record<string, string>) {
    return fetch(`${server.baseUrl}/api/integrations/sen-no-kuni-hub`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Event-Version": "1.0", ...headers },
      body: rawBody,
    });
  }

  it("v1署名の正常系: entitlement.grantedでkokudakaが付与される", async () => {
    const { keyId, systemKey, secret } = await createSettings();
    const { userId, commonUserId } = await createUserWithCommonUserId();
    const entitlementId = `ent-${crypto.randomUUID()}`;
    const body = {
      event_id: `evt-${crypto.randomUUID()}`,
      event_type: "entitlement.granted",
      source_system_key: systemKey,
      entitlement_id: entitlementId,
      common_user_id: commonUserId,
      entitlement_type: "kokudaka",
      quantity: 300,
    };
    const rawBody = JSON.stringify(body);
    const headers = signV1({ keyId, secret, rawBody });

    const res = await post(rawBody, headers);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "succeeded" });

    const client = supabase();
    const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.kokudaka).toBe(300);
  });

  it("v2署名の正常系: entitlement.grantedの後、同一entitlement_idへのentitlement.revokedで取り消される", async () => {
    const { keyId, systemKey, secret } = await createSettings();
    const { userId, commonUserId } = await createUserWithCommonUserId();
    const entitlementId = `ent-${crypto.randomUUID()}`;

    const grantBody = {
      event_id: `evt-${crypto.randomUUID()}`,
      event_type: "entitlement.granted",
      source_system_key: systemKey,
      entitlement_id: entitlementId,
      common_user_id: commonUserId,
      entitlement_type: "kokudaka",
      quantity: 200,
    };
    const grantRawBody = JSON.stringify(grantBody);
    const grantHeaders = signV2({
      keyId,
      secret,
      rawBody: grantRawBody,
      eventVersion: "1.0",
      idempotencyKey: grantBody.event_id,
    });
    const grantRes = await post(grantRawBody, grantHeaders);
    expect(grantRes.status).toBe(200);

    const revokeBody = {
      event_id: `evt-${crypto.randomUUID()}`,
      event_type: "entitlement.revoked",
      source_system_key: systemKey,
      entitlement_id: entitlementId,
    };
    const revokeRawBody = JSON.stringify(revokeBody);
    const revokeHeaders = signV2({
      keyId,
      secret,
      rawBody: revokeRawBody,
      eventVersion: "1.0",
      idempotencyKey: revokeBody.event_id,
    });
    const revokeRes = await post(revokeRawBody, revokeHeaders);
    expect(revokeRes.status).toBe(200);

    const client = supabase();
    const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.kokudaka).toBe(0);

    const { data: entitlementRow, error: entitlementError } = await client
      .from("entitlements")
      .select("status")
      .eq("source_system_key", systemKey)
      .eq("entitlement_id", entitlementId)
      .single();
    if (entitlementError) throw entitlementError;
    expect(entitlementRow.status).toBe("revoked");
  });

  it("v2署名: X-Event-Version/Idempotency-Keyが欠けていると401 missing_headers", async () => {
    const { keyId, secret } = await createSettings();
    const rawBody = JSON.stringify({ event_type: "order.paid" });
    const headers = signV2({ keyId, secret, rawBody, eventVersion: "1.0", idempotencyKey: "dummy" });
    delete headers["X-Event-Version"];

    const res = await fetch(`${server.baseUrl}/api/integrations/sen-no-kuni-hub`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: rawBody,
    });
    expect(res.status).toBe(401);
    const responseBody = await res.json();
    expect(responseBody).toMatchObject({ ok: false, error: { code: "missing_headers" } });
  });

  it("署名が改ざんされている場合は401 invalid_signature", async () => {
    const { keyId, secret } = await createSettings();
    const rawBody = JSON.stringify({ event_type: "order.paid", event_id: crypto.randomUUID() });
    const headers = signV1({ keyId, secret, rawBody });
    headers["X-SenNoKuni-Signature"] = headers["X-SenNoKuni-Signature"].replace(/^./, (c) => (c === "0" ? "1" : "0"));

    const res = await post(rawBody, headers);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: { code: "invalid_signature" } });
  });

  it("body改ざん(署名対象と不一致)は401 invalid_signature", async () => {
    const { keyId, secret } = await createSettings();
    const rawBody = JSON.stringify({ event_type: "order.paid", event_id: crypto.randomUUID(), amount: 1000 });
    const headers = signV1({ keyId, secret, rawBody });
    const tamperedRawBody = JSON.stringify({ event_type: "order.paid", event_id: crypto.randomUUID(), amount: 999999 });

    const res = await post(tamperedRawBody, headers);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: { code: "invalid_signature" } });
  });

  it("timestampが許容範囲(5分)外は401 invalid_timestamp", async () => {
    const { keyId, secret } = await createSettings();
    const rawBody = JSON.stringify({ event_type: "order.paid", event_id: crypto.randomUUID() });
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600);
    const headers = signV1({ keyId, secret, rawBody, timestamp: staleTimestamp });

    const res = await post(rawBody, headers);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: { code: "invalid_timestamp" } });
  });

  it("同一nonceの再送は401 replayed_nonce", async () => {
    const { keyId, secret } = await createSettings();
    const nonce = crypto.randomUUID();
    const rawBody1 = JSON.stringify({ event_type: "order.paid", event_id: crypto.randomUUID() });
    const headers1 = signV1({ keyId, secret, rawBody: rawBody1, nonce });
    const firstRes = await post(rawBody1, headers1);
    expect(firstRes.status).toBe(200);

    const rawBody2 = JSON.stringify({ event_type: "order.paid", event_id: crypto.randomUUID() });
    const headers2 = signV1({ keyId, secret, rawBody: rawBody2, nonce });
    const secondRes = await post(rawBody2, headers2);
    expect(secondRes.status).toBe(401);
    const body = await secondRes.json();
    expect(body).toMatchObject({ ok: false, error: { code: "replayed_nonce" } });
  });

  it("未登録のkey_idは401 unknown_key", async () => {
    const rawBody = JSON.stringify({ event_type: "order.paid", event_id: crypto.randomUUID() });
    const headers = signV1({ keyId: `unknown-${crypto.randomUUID()}`, secret: "dummy-secret", rawBody });

    const res = await post(rawBody, headers);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: { code: "unknown_key" } });
  });

  it("enabled=falseの連携は401 disabled", async () => {
    const { keyId, secret } = await createSettings({ enabled: false });
    const rawBody = JSON.stringify({ event_type: "order.paid", event_id: crypto.randomUUID() });
    const headers = signV1({ keyId, secret, rawBody });

    const res = await post(rawBody, headers);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: { code: "disabled" } });
  });

  it("v1_disabled_at設定済みの連携はv1署名を401 v1_disabledで拒否し、v2署名は成功する", async () => {
    const pastDate = new Date(Date.now() - 3600_000).toISOString();
    const { keyId, secret } = await createSettings({ v1_disabled_at: pastDate });

    const v1RawBody = JSON.stringify({ event_type: "order.paid", event_id: crypto.randomUUID() });
    const v1Headers = signV1({ keyId, secret, rawBody: v1RawBody });
    const v1Res = await post(v1RawBody, v1Headers);
    expect(v1Res.status).toBe(401);
    const v1Body = await v1Res.json();
    expect(v1Body).toMatchObject({ ok: false, error: { code: "v1_disabled" } });

    const eventId = crypto.randomUUID();
    const v2RawBody = JSON.stringify({ event_type: "order.paid", event_id: eventId });
    const v2Headers = signV2({ keyId, secret, rawBody: v2RawBody, eventVersion: "1.0", idempotencyKey: eventId });
    const v2Res = await post(v2RawBody, v2Headers);
    expect(v2Res.status).toBe(200);
  });

  it("customer.assignment.changedでusers.assigned_agent_idが更新される", async () => {
    const { keyId, systemKey, secret } = await createSettings();
    const { userId, commonUserId } = await createUserWithCommonUserId();

    const client = supabase();
    const agentCode = `test-agent-${crypto.randomUUID()}`;
    const { data: agent, error: agentError } = await client
      .from("agents")
      .insert({ name: "テスト代理店", referral_code: `ref-${crypto.randomUUID()}`, external_id: agentCode })
      .select("id")
      .single();
    if (agentError) throw agentError;
    createdAgentIds.push(agent.id as string);

    const body = {
      event_id: `evt-${crypto.randomUUID()}`,
      event_type: "customer.assignment.changed",
      source_system_key: systemKey,
      common_user_id: commonUserId,
      agent_code: agentCode,
    };
    const rawBody = JSON.stringify(body);
    const headers = signV1({ keyId, secret, rawBody });

    const res = await post(rawBody, headers);
    expect(res.status).toBe(200);

    const { data: user, error: userError } = await client.from("users").select("assigned_agent_id").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.assigned_agent_id).toBe(agent.id);
  });

  it("order.paidはshopping_order_eventsへ記録され、既存の残高・購入処理には影響しない", async () => {
    const { keyId, systemKey, secret } = await createSettings();
    const { userId, commonUserId } = await createUserWithCommonUserId();
    const orderId = `order-${crypto.randomUUID()}`;
    const eventId = `evt-${crypto.randomUUID()}`;
    const body = {
      event_id: eventId,
      event_type: "order.paid",
      source_system_key: systemKey,
      common_user_id: commonUserId,
      order_id: orderId,
      amount: 5000,
    };
    const rawBody = JSON.stringify(body);
    const headers = signV1({ keyId, secret, rawBody });

    const res = await post(rawBody, headers);
    expect(res.status).toBe(200);

    const client = supabase();
    const { data: eventRow, error: eventError } = await client
      .from("shopping_order_events")
      .select("event_type, order_id, user_id, amount")
      .eq("source_system_key", systemKey)
      .eq("event_id", eventId)
      .single();
    if (eventError) throw eventError;
    expect(eventRow).toMatchObject({ event_type: "order.paid", order_id: orderId, user_id: userId, amount: 5000 });

    const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.kokudaka).toBe(0); // order.paidは監査記録のみで残高には影響しない
  });
});
