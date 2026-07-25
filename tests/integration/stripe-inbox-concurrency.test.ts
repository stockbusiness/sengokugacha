import { afterEach, describe, expect, it } from "vitest";
import { getTestSupabaseClient, hasIntegrationTestDatabase } from "./support/env";

// 千ノ国パスポート Phase C-0(§8 Stripe Webhook inboxテスト)。
// claim_stripe_webhook_event()を同一stripe_event_idで10並列claimし、実処理(newを得るの)
// が1回だけであることを検証する。

describe.skipIf(!hasIntegrationTestDatabase())("claim_stripe_webhook_event: 10並列claim", () => {
  const createdEventIds: string[] = [];

  afterEach(async () => {
    const client = getTestSupabaseClient();
    for (const stripeEventId of createdEventIds.splice(0)) {
      await client.from("stripe_webhook_events").delete().eq("stripe_event_id", stripeEventId);
    }
  });

  it("同一stripe_event_idへの10並列claimはnewが1件だけになる", async () => {
    const client = getTestSupabaseClient();
    const stripeEventId = `evt_test_${crypto.randomUUID()}`;
    createdEventIds.push(stripeEventId);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        client.rpc("claim_stripe_webhook_event", {
          p_stripe_event_id: stripeEventId,
          p_event_type: "checkout.session.completed",
          p_payload: { id: stripeEventId },
          p_claim_token: crypto.randomUUID(),
        })
      )
    );

    const outcomes = results.map((r) => {
      if (r.error) throw r.error;
      return (r.data as { claim_outcome: string }[])[0].claim_outcome;
    });

    expect(outcomes.filter((o) => o === "new")).toHaveLength(1);
    expect(outcomes.every((o) => o === "new" || o === "in_progress")).toBe(true);
  });

  it("succeededになった後の再送はduplicateを返す", async () => {
    const client = getTestSupabaseClient();
    const stripeEventId = `evt_test_${crypto.randomUUID()}`;
    createdEventIds.push(stripeEventId);
    const claimToken = crypto.randomUUID();

    const { data: firstClaim, error: firstError } = await client.rpc("claim_stripe_webhook_event", {
      p_stripe_event_id: stripeEventId,
      p_event_type: "checkout.session.completed",
      p_payload: { id: stripeEventId },
      p_claim_token: claimToken,
    });
    if (firstError) throw firstError;
    const { inbox_event_id: inboxEventId } = (firstClaim as { inbox_event_id: string }[])[0];

    await client
      .from("stripe_webhook_events")
      .update({ status: "succeeded" })
      .eq("id", inboxEventId)
      .eq("claim_token", claimToken);

    const { data: resendClaim, error: resendError } = await client.rpc("claim_stripe_webhook_event", {
      p_stripe_event_id: stripeEventId,
      p_event_type: "checkout.session.completed",
      p_payload: { id: stripeEventId },
      p_claim_token: crypto.randomUUID(),
    });
    if (resendError) throw resendError;
    expect((resendClaim as { claim_outcome: string }[])[0].claim_outcome).toBe("duplicate");
  });

  it("failedの後の再claimはretryableになり、attempt上限でdeadになる", async () => {
    const client = getTestSupabaseClient();
    const stripeEventId = `evt_test_${crypto.randomUUID()}`;
    createdEventIds.push(stripeEventId);

    const { data: firstClaim, error: firstError } = await client.rpc("claim_stripe_webhook_event", {
      p_stripe_event_id: stripeEventId,
      p_event_type: "checkout.session.completed",
      p_payload: { id: stripeEventId },
      p_claim_token: crypto.randomUUID(),
      p_max_attempts: 2,
    });
    if (firstError) throw firstError;
    const first = (firstClaim as { claim_outcome: string; inbox_event_id: string }[])[0];
    expect(first.claim_outcome).toBe("new");

    // 1回目のclaimはp_claim_tokenをinline指定していたため、実際のtokenをDBから読み直す。
    const { data: row1, error: row1Error } = await client
      .from("stripe_webhook_events")
      .select("claim_token")
      .eq("stripe_event_id", stripeEventId)
      .single();
    if (row1Error) throw row1Error;
    const { data: failed1, error: failed1Error } = await client.rpc("mark_stripe_webhook_failed", {
      p_inbox_event_id: first.inbox_event_id,
      p_claim_token: row1.claim_token,
      p_error: "test failure 1",
    });
    if (failed1Error) throw failed1Error;
    expect(failed1).toBe(true);

    const secondToken = crypto.randomUUID();
    const { data: secondClaim, error: secondError } = await client.rpc("claim_stripe_webhook_event", {
      p_stripe_event_id: stripeEventId,
      p_event_type: "checkout.session.completed",
      p_payload: { id: stripeEventId },
      p_claim_token: secondToken,
      p_max_attempts: 2,
    });
    if (secondError) throw secondError;
    expect((secondClaim as { claim_outcome: string }[])[0].claim_outcome).toBe("retryable");

    const { data: failed2, error: failed2Error } = await client.rpc("mark_stripe_webhook_failed", {
      p_inbox_event_id: first.inbox_event_id,
      p_claim_token: secondToken,
      p_error: "test failure 2",
    });
    if (failed2Error) throw failed2Error;
    expect(failed2).toBe(true);

    // attempt_count(2)がp_max_attempts(2)に達しているため、次のclaimはdeadになる。
    const { data: thirdClaim, error: thirdError } = await client.rpc("claim_stripe_webhook_event", {
      p_stripe_event_id: stripeEventId,
      p_event_type: "checkout.session.completed",
      p_payload: { id: stripeEventId },
      p_claim_token: crypto.randomUUID(),
      p_max_attempts: 2,
    });
    if (thirdError) throw thirdError;
    expect((thirdClaim as { claim_outcome: string }[])[0].claim_outcome).toBe("dead");

    const { data: row, error: rowError } = await client
      .from("stripe_webhook_events")
      .select("status")
      .eq("stripe_event_id", stripeEventId)
      .single();
    if (rowError) throw rowError;
    expect(row.status).toBe("dead");
  });

  it("lease切れ後は別workerが再claimでき、古いclaim_tokenでは完了・失敗のどちらも更新できない", async () => {
    const client = getTestSupabaseClient();
    const stripeEventId = `evt_test_${crypto.randomUUID()}`;
    createdEventIds.push(stripeEventId);
    const oldToken = crypto.randomUUID();

    const { data: firstClaim, error: firstError } = await client.rpc("claim_stripe_webhook_event", {
      p_stripe_event_id: stripeEventId,
      p_event_type: "checkout.session.completed",
      p_payload: { id: stripeEventId },
      p_claim_token: oldToken,
      p_lease_seconds: 1,
    });
    if (firstError) throw firstError;
    const { inbox_event_id: inboxEventId } = (firstClaim as { claim_outcome: string; inbox_event_id: string }[])[0];

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const newToken = crypto.randomUUID();
    const { data: secondClaim, error: secondError } = await client.rpc("claim_stripe_webhook_event", {
      p_stripe_event_id: stripeEventId,
      p_event_type: "checkout.session.completed",
      p_payload: { id: stripeEventId },
      p_claim_token: newToken,
      p_lease_seconds: 300,
    });
    if (secondError) throw secondError;
    expect((secondClaim as { claim_outcome: string }[])[0].claim_outcome).toBe("retryable");

    const { data: succeededByOldToken, error: succeededByOldTokenError } = await client.rpc("mark_stripe_webhook_succeeded", {
      p_inbox_event_id: inboxEventId,
      p_claim_token: oldToken,
    });
    if (succeededByOldTokenError) throw succeededByOldTokenError;
    expect(succeededByOldToken).toBe(false);

    const { data: failedByOldToken, error: failedByOldTokenError } = await client.rpc("mark_stripe_webhook_failed", {
      p_inbox_event_id: inboxEventId,
      p_claim_token: oldToken,
      p_error: "stale worker",
    });
    if (failedByOldTokenError) throw failedByOldTokenError;
    expect(failedByOldToken).toBe(false);

    const { data: succeededByNewToken, error: succeededByNewTokenError } = await client.rpc("mark_stripe_webhook_succeeded", {
      p_inbox_event_id: inboxEventId,
      p_claim_token: newToken,
    });
    if (succeededByNewTokenError) throw succeededByNewTokenError;
    expect(succeededByNewToken).toBe(true);
  });
});
