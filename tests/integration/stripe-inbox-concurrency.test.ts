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
});
