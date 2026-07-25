import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminCookieHeader, signAdminSessionToken } from "./support/admin-jwt";
import { startTestServer, type TestServer } from "./support/server";
import { buildCheckoutSessionCompletedPayload, signStripePayload } from "./support/stripe-webhook";

// 千ノ国パスポート Phase C-0 PR4(§5.3 Stripe Webhook purchase連携、§5.4 不整合ケース)。
// POST /api/stripe/webhookへ実際に検証を通過する署名付きリクエストを送り、
// checkout.session.completed受信→purchase pending→processing→権利付与→completed→
// inbox succeededという一連の流れと、二重付与防止・不整合ケースの扱いを確認する。

const TEST_PORT = 39219;
const WEBHOOK_SECRET = "whsec_contract_test_secret";
const hasTestDatabase = Boolean(process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_SERVICE_ROLE_KEY);

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(TEST_PORT);
}, 60000);

afterAll(async () => {
  await server.stop();
});

describe.skipIf(!hasTestDatabase)("POST /api/stripe/webhook(DB接続あり、purchase連携)", () => {
  let paymentSettingsId: string | undefined;
  const createdUserIds: string[] = [];
  const createdPurchaseIds: string[] = [];

  function supabase() {
    return createClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!);
  }

  beforeEach(async () => {
    const client = supabase();
    const { data, error } = await client
      .from("payment_settings")
      .insert({
        stripe_publishable_key: "pk_test_contract-test-dummy",
        stripe_secret_key: "sk_test_contract-test-dummy",
        stripe_webhook_secret: WEBHOOK_SECRET,
      })
      .select("id")
      .single();
    if (error) throw error;
    paymentSettingsId = data.id as string;
  });

  afterEach(async () => {
    const client = supabase();
    if (paymentSettingsId) {
      await client.from("payment_settings").delete().eq("id", paymentSettingsId);
      paymentSettingsId = undefined;
    }
    for (const purchaseId of createdPurchaseIds.splice(0)) {
      await client.from("purchase_grant_steps").delete().eq("purchase_id", purchaseId);
      await client.from("agent_sales").delete().eq("purchase_id", purchaseId);
      await client.from("stripe_webhook_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await client.from("purchases").delete().eq("id", purchaseId);
    }
    for (const userId of createdUserIds.splice(0)) {
      await client.from("users").delete().eq("id", userId);
    }
  });

  async function createPendingPurchase(userId: string, overrides: Record<string, unknown> = {}) {
    const client = supabase();
    const { data, error } = await client
      .from("purchases")
      .insert({
        user_id: userId,
        stripe_session_id: `cs_test_${crypto.randomUUID()}`,
        item_type: "kokudaka",
        amount: 1000,
        grant_amount: 500,
        status: "pending",
        ...overrides,
      })
      .select("id, stripe_session_id")
      .single();
    if (error) throw error;
    createdPurchaseIds.push(data.id as string);
    return data as { id: string; stripe_session_id: string };
  }

  async function postWebhook(payload: Record<string, unknown>) {
    const { rawBody, signature } = signStripePayload(payload, WEBHOOK_SECRET);
    return fetch(`${server.baseUrl}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signature },
      body: rawBody,
    });
  }

  it("checkout.session.completedでpurchaseが完了・kokudaka付与され、同一event再送は二重付与しない", async () => {
    const client = supabase();
    const { data: user, error: userError } = await client
      .from("users")
      .insert({ line_user_id: `test-line-user-${crypto.randomUUID()}`, display_name: "テストユーザー", kokudaka: 0 })
      .select("id")
      .single();
    if (userError) throw userError;
    createdUserIds.push(user.id as string);

    const purchase = await createPendingPurchase(user.id as string);
    const eventId = `evt_test_${crypto.randomUUID()}`;
    const payload = buildCheckoutSessionCompletedPayload({ eventId, sessionId: purchase.stripe_session_id });

    const firstRes = await postWebhook(payload);
    expect(firstRes.status).toBe(200);

    const { data: purchaseAfterFirst, error: purchaseAfterFirstError } = await client
      .from("purchases")
      .select("status, grant_status")
      .eq("id", purchase.id)
      .single();
    if (purchaseAfterFirstError) throw purchaseAfterFirstError;
    expect(purchaseAfterFirst.status).toBe("completed");
    expect(purchaseAfterFirst.grant_status).toBe("granted");

    const { data: inboxRow, error: inboxError } = await client
      .from("stripe_webhook_events")
      .select("status")
      .eq("stripe_event_id", eventId)
      .single();
    if (inboxError) throw inboxError;
    expect(inboxRow.status).toBe("succeeded");

    const { data: userAfterFirst, error: userAfterFirstError } = await client
      .from("users")
      .select("kokudaka")
      .eq("id", user.id)
      .single();
    if (userAfterFirstError) throw userAfterFirstError;
    expect(userAfterFirst.kokudaka).toBe(500);

    // 同一event_idの再送(Stripeの自動再送・手動再送を模する)。
    const secondRes = await postWebhook(payload);
    expect(secondRes.status).toBe(200);

    const { data: userAfterResend, error: userAfterResendError } = await client
      .from("users")
      .select("kokudaka")
      .eq("id", user.id)
      .single();
    if (userAfterResendError) throw userAfterResendError;
    expect(userAfterResend.kokudaka).toBe(500); // 二重付与されていないこと

    const { data: inboxRows, error: inboxRowsError } = await client
      .from("stripe_webhook_events")
      .select("id")
      .eq("stripe_event_id", eventId);
    if (inboxRowsError) throw inboxRowsError;
    expect(inboxRows).toHaveLength(1); // inbox行も1件のまま
  });

  it("対応するpurchaseが存在しない場合も200を返す(想定外イベントとして処理済み扱い)", async () => {
    const payload = buildCheckoutSessionCompletedPayload({ sessionId: `cs_test_nonexistent_${crypto.randomUUID()}` });
    const res = await postWebhook(payload);
    expect(res.status).toBe(200);
  });

  it("purchaseが既にcompletedの場合は二重処理しない", async () => {
    const client = supabase();
    const { data: user, error: userError } = await client
      .from("users")
      .insert({ line_user_id: `test-line-user-${crypto.randomUUID()}`, display_name: "テストユーザー", kokudaka: 999 })
      .select("id")
      .single();
    if (userError) throw userError;
    createdUserIds.push(user.id as string);

    const purchase = await createPendingPurchase(user.id as string, { status: "completed", grant_status: "granted" });
    const payload = buildCheckoutSessionCompletedPayload({ sessionId: purchase.stripe_session_id });

    const res = await postWebhook(payload);
    expect(res.status).toBe(200);

    const { data: userAfter, error: userAfterError } = await client.from("users").select("kokudaka").eq("id", user.id).single();
    if (userAfterError) throw userAfterError;
    expect(userAfter.kokudaka).toBe(999); // claimForProcessing(status='pending'限定)に阻まれ、再付与されない

    const { data: purchaseAfter, error: purchaseAfterError } = await client
      .from("purchases")
      .select("status")
      .eq("id", purchase.id)
      .single();
    if (purchaseAfterError) throw purchaseAfterError;
    expect(purchaseAfter.status).toBe("completed");
  });

  it("purchaseが既にprocessingの場合は二重処理しない", async () => {
    const client = supabase();
    const { data: user, error: userError } = await client
      .from("users")
      .insert({ line_user_id: `test-line-user-${crypto.randomUUID()}`, display_name: "テストユーザー", kokudaka: 0 })
      .select("id")
      .single();
    if (userError) throw userError;
    createdUserIds.push(user.id as string);

    const purchase = await createPendingPurchase(user.id as string, { status: "processing", grant_status: "processing" });
    const payload = buildCheckoutSessionCompletedPayload({ sessionId: purchase.stripe_session_id });

    const res = await postWebhook(payload);
    expect(res.status).toBe(200);

    const { data: userAfter, error: userAfterError } = await client.from("users").select("kokudaka").eq("id", user.id).single();
    if (userAfterError) throw userAfterError;
    expect(userAfter.kokudaka).toBe(0); // processing中の行には手を出さない(管理画面からの手動復旧に委ねる)
  });

  it("grant_status='failed'の購入は管理画面の一覧(GET /api/admin/purchases)に復旧対象として表示される", async () => {
    const client = supabase();
    const { data: user, error: userError } = await client
      .from("users")
      .insert({ line_user_id: `test-line-user-${crypto.randomUUID()}`, display_name: "テストユーザー", kokudaka: 0 })
      .select("id")
      .single();
    if (userError) throw userError;
    createdUserIds.push(user.id as string);

    // inbox succeeded(webhook自体は正常受信)だが権利付与に失敗した状態
    // (processStripeWebhookEventの設計上、grant失敗はWebhookの失敗として扱わない)を直接再現する。
    const purchase = await createPendingPurchase(user.id as string, {
      status: "processing",
      grant_status: "failed",
      grant_last_error: "test-only: 意図的な権利付与失敗",
    });

    const token = await signAdminSessionToken("operator");
    const res = await fetch(`${server.baseUrl}/api/admin/purchases`, {
      method: "GET",
      headers: { Cookie: adminCookieHeader(token) },
    });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { id: string; grantStatus: string; grantLastError: string | null }[];
    const row = rows.find((r) => r.id === purchase.id);
    expect(row).toBeDefined();
    expect(row?.grantStatus).toBe("failed");
    expect(row?.grantLastError).toBe("test-only: 意図的な権利付与失敗");
  });
});
