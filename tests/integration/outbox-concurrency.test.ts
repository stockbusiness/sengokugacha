import { afterEach, describe, expect, it } from "vitest";
import { getTestSupabaseClient, hasIntegrationTestDatabase } from "./support/env";

// 千ノ国パスポート Phase C-0 PR4(§8 Outbox統合テスト追加)。
// enqueueEvent相当の一意性制約、claim_integration_outbox_event()/mark_integration_
// outbox_sent()/mark_integration_outbox_failed()(20260809000008)を対象に、
// dead状態・最大試行回数・next_retry_at、および「2並列drainで同じイベントを
// 二重送信しない」ことをclaim原子性のレベルで検証する。外部送信そのもの
// (confirmReferral/notifyPlotPurchase)は実際の外部ホストへの到達を要するため、
// この統合テストの対象外とする(src/modules/commerce/application/
// run-purchase-grant.test.tsのfakeによるunit testで「送信失敗時もpurchase本体は
// 完了する」設計を確認済み)。

describe.skipIf(!hasIntegrationTestDatabase())("integration_outbox_events: 一意性・claim/mark・drain排他制御", () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    const client = getTestSupabaseClient();
    for (const id of createdIds.splice(0)) {
      await client.from("integration_outbox_events").delete().eq("id", id);
    }
  });

  async function insertRow(client: ReturnType<typeof getTestSupabaseClient>, overrides: Record<string, unknown> = {}) {
    const sourceId = `purchase-${crypto.randomUUID()}`;
    const { data, error } = await client
      .from("integration_outbox_events")
      .insert({
        source_type: "purchase",
        source_id: sourceId,
        event_type: "referral.confirmed",
        target_system_key: "sengoku-ai",
        payload: { hello: "world" },
        ...overrides,
      })
      .select("id")
      .single();
    if (error) throw error;
    createdIds.push(data.id as string);
    return data.id as string;
  }

  it("同一source_type/source_id/event_type/target_system_keyは重複登録できない(unique制約)", async () => {
    const client = getTestSupabaseClient();
    const sourceId = `purchase-${crypto.randomUUID()}`;
    const id1 = await insertRow(client, { source_id: sourceId });

    const { error } = await client.from("integration_outbox_events").insert({
      source_type: "purchase",
      source_id: sourceId,
      event_type: "referral.confirmed",
      target_system_key: "sengoku-ai",
      payload: { hello: "world" },
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23505");

    const { data: rows, error: rowsError } = await client
      .from("integration_outbox_events")
      .select("id")
      .eq("source_id", sourceId);
    if (rowsError) throw rowsError;
    expect(rows).toHaveLength(1);
    expect(rows?.[0].id).toBe(id1);
  });

  it("2並列でclaimしても片方だけがclaimedになる(drainの二重送信防止の要)", async () => {
    const client = getTestSupabaseClient();
    const id = await insertRow(client);

    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        client.rpc("claim_integration_outbox_event", { p_id: id, p_claim_token: crypto.randomUUID() })
      )
    );
    for (const r of results) {
      if (r.error) throw r.error;
    }
    const outcomes = results.map((r) => r.data as string);
    expect(outcomes.filter((o) => o === "claimed")).toHaveLength(1);
    expect(outcomes.every((o) => o === "claimed" || o === "in_progress")).toBe(true);
  });

  it("claim後にsentへ遷移し、成功済みの再claimはalready_sentになる", async () => {
    const client = getTestSupabaseClient();
    const id = await insertRow(client);
    const claimToken = crypto.randomUUID();

    const { data: claimOutcome, error: claimError } = await client.rpc("claim_integration_outbox_event", {
      p_id: id,
      p_claim_token: claimToken,
    });
    if (claimError) throw claimError;
    expect(claimOutcome).toBe("claimed");

    const { data: sent, error: sentError } = await client.rpc("mark_integration_outbox_sent", {
      p_id: id,
      p_claim_token: claimToken,
    });
    if (sentError) throw sentError;
    expect(sent).toBe(true);

    const { data: resendOutcome, error: resendError } = await client.rpc("claim_integration_outbox_event", {
      p_id: id,
      p_claim_token: crypto.randomUUID(),
    });
    if (resendError) throw resendError;
    expect(resendOutcome).toBe("already_sent");
  });

  it("失敗するとnext_retry_atが設定され、期限前は再claimできない(not_due)", async () => {
    const client = getTestSupabaseClient();
    const id = await insertRow(client);
    const claimToken = crypto.randomUUID();

    const { data: claimOutcome, error: claimError } = await client.rpc("claim_integration_outbox_event", {
      p_id: id,
      p_claim_token: claimToken,
    });
    if (claimError) throw claimError;
    expect(claimOutcome).toBe("claimed");

    const { data: failed, error: failedError } = await client.rpc("mark_integration_outbox_failed", {
      p_id: id,
      p_claim_token: claimToken,
      p_error: "test failure",
    });
    if (failedError) throw failedError;
    expect(failed).toBe(true);

    const { data: row, error: rowError } = await client
      .from("integration_outbox_events")
      .select("status, next_retry_at, last_error")
      .eq("id", id)
      .single();
    if (rowError) throw rowError;
    expect(row.status).toBe("failed");
    expect(row.last_error).toBe("test failure");
    expect(row.next_retry_at).not.toBeNull();
    expect(new Date(row.next_retry_at as string).getTime()).toBeGreaterThan(Date.now());

    const { data: retryOutcome, error: retryError } = await client.rpc("claim_integration_outbox_event", {
      p_id: id,
      p_claim_token: crypto.randomUUID(),
    });
    if (retryError) throw retryError;
    expect(retryOutcome).toBe("not_due");
  });

  it("古いclaim_tokenでは完了・失敗のどちらも更新できない(lease/fencing)", async () => {
    const client = getTestSupabaseClient();
    const id = await insertRow(client);
    const oldToken = crypto.randomUUID();

    const { data: claimOutcome, error: claimError } = await client.rpc("claim_integration_outbox_event", {
      p_id: id,
      p_claim_token: oldToken,
      p_lease_seconds: 1,
    });
    if (claimError) throw claimError;
    expect(claimOutcome).toBe("claimed");

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const newToken = crypto.randomUUID();
    const { data: secondClaim, error: secondClaimError } = await client.rpc("claim_integration_outbox_event", {
      p_id: id,
      p_claim_token: newToken,
      p_lease_seconds: 300,
    });
    if (secondClaimError) throw secondClaimError;
    expect(secondClaim).toBe("claimed"); // lease切れのため別workerが再claimできる

    const { data: sentByOldToken, error: sentByOldTokenError } = await client.rpc("mark_integration_outbox_sent", {
      p_id: id,
      p_claim_token: oldToken,
    });
    if (sentByOldTokenError) throw sentByOldTokenError;
    expect(sentByOldToken).toBe(false);

    const { data: failedByOldToken, error: failedByOldTokenError } = await client.rpc("mark_integration_outbox_failed", {
      p_id: id,
      p_claim_token: oldToken,
      p_error: "stale worker",
    });
    if (failedByOldTokenError) throw failedByOldTokenError;
    expect(failedByOldToken).toBe(false);

    const { data: sentByNewToken, error: sentByNewTokenError } = await client.rpc("mark_integration_outbox_sent", {
      p_id: id,
      p_claim_token: newToken,
    });
    if (sentByNewTokenError) throw sentByNewTokenError;
    expect(sentByNewToken).toBe(true);
  });

  it("attempt上限に達するとdeadになる", async () => {
    const client = getTestSupabaseClient();
    const id = await insertRow(client);

    for (let i = 0; i < 2; i++) {
      const claimToken = crypto.randomUUID();
      const { data: claimOutcome, error: claimError } = await client.rpc("claim_integration_outbox_event", {
        p_id: id,
        p_claim_token: claimToken,
        p_max_attempts: 2,
      });
      if (claimError) throw claimError;
      expect(claimOutcome).toBe("claimed");

      await client.from("integration_outbox_events").update({ next_retry_at: null }).eq("id", id); // テストのため即再試行可能にする
      const { error: failedError } = await client.rpc("mark_integration_outbox_failed", {
        p_id: id,
        p_claim_token: claimToken,
        p_error: `test failure ${i}`,
      });
      if (failedError) throw failedError;
      await client.from("integration_outbox_events").update({ next_retry_at: null }).eq("id", id);
    }

    const { data: deadOutcome, error: deadError } = await client.rpc("claim_integration_outbox_event", {
      p_id: id,
      p_claim_token: crypto.randomUUID(),
      p_max_attempts: 2,
    });
    if (deadError) throw deadError;
    expect(deadOutcome).toBe("dead");

    const { data: row, error: rowError } = await client.from("integration_outbox_events").select("status").eq("id", id).single();
    if (rowError) throw rowError;
    expect(row.status).toBe("dead");
  });
});

describe.skipIf(!hasIntegrationTestDatabase())("notification_outbox_events: claim/mark(integration_outbox_eventsと対称)", () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    const client = getTestSupabaseClient();
    for (const id of createdIds.splice(0)) {
      await client.from("notification_outbox_events").delete().eq("id", id);
    }
  });

  it("2並列でclaimしても片方だけがclaimedになる", async () => {
    const client = getTestSupabaseClient();
    const { data, error } = await client
      .from("notification_outbox_events")
      .insert({
        source_type: "purchase",
        source_id: `purchase-${crypto.randomUUID()}`,
        event_type: "notification.plot_purchased",
        target_system_key: "line",
        payload: { user_id: "test-user", plot_id: "test-plot" },
      })
      .select("id")
      .single();
    if (error) throw error;
    createdIds.push(data.id as string);

    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        client.rpc("claim_notification_outbox_event", { p_id: data.id, p_claim_token: crypto.randomUUID() })
      )
    );
    for (const r of results) {
      if (r.error) throw r.error;
    }
    const outcomes = results.map((r) => r.data as string);
    expect(outcomes.filter((o) => o === "claimed")).toHaveLength(1);
  });
});
