import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getTestSupabaseClient, hasIntegrationTestDatabase } from "./support/env";

// 千ノ国パスポート Phase C-0(§11 integration inboxテスト)。
// claim_integration_inbox_event()の並行実行安全性、および
// 同一event_id+同一payload_hash(duplicate) / 異なるpayload_hash(conflict)の判定を検証する。

function payloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

describe.skipIf(!hasIntegrationTestDatabase())("claim_integration_inbox_event: 並行実行・冪等性", () => {
  const createdKeys: { sourceSystemKey: string; eventId: string }[] = [];

  afterEach(async () => {
    const client = getTestSupabaseClient();
    for (const { sourceSystemKey, eventId } of createdKeys.splice(0)) {
      await client
        .from("integration_inbox_events")
        .delete()
        .eq("source_system_key", sourceSystemKey)
        .eq("event_id", eventId);
    }
  });

  it("同一event_idへの10並列claimはnewが1件だけになる", async () => {
    const client = getTestSupabaseClient();
    const sourceSystemKey = "sen-no-kuni-hub-test";
    const eventId = `evt-${crypto.randomUUID()}`;
    createdKeys.push({ sourceSystemKey, eventId });
    const payload = { hello: "world" };
    const hash = payloadHash(payload);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        client.rpc("claim_integration_inbox_event", {
          p_source_system_key: sourceSystemKey,
          p_event_id: eventId,
          p_event_type: "entitlement.granted",
          p_payload: payload,
          p_payload_hash: hash,
          p_event_version: "1",
        })
      )
    );

    const outcomes = results.map((r) => {
      if (r.error) throw r.error;
      return (r.data as { claim_outcome: string }[])[0].claim_outcome;
    });

    expect(outcomes.filter((o) => o === "new")).toHaveLength(1);
  });

  it("同一event_id+同一payload_hashの再送はduplicateになる(succeeded後)", async () => {
    const client = getTestSupabaseClient();
    const sourceSystemKey = "sen-no-kuni-hub-test";
    const eventId = `evt-${crypto.randomUUID()}`;
    createdKeys.push({ sourceSystemKey, eventId });
    const payload = { hello: "world" };
    const hash = payloadHash(payload);

    const { data: first, error: firstError } = await client.rpc("claim_integration_inbox_event", {
      p_source_system_key: sourceSystemKey,
      p_event_id: eventId,
      p_event_type: "entitlement.granted",
      p_payload: payload,
      p_payload_hash: hash,
      p_event_version: "1",
    });
    if (firstError) throw firstError;
    const { event_row_id: rowId } = (first as { event_row_id: string }[])[0];

    await client.from("integration_inbox_events").update({ status: "succeeded" }).eq("id", rowId);

    const { data: resend, error: resendError } = await client.rpc("claim_integration_inbox_event", {
      p_source_system_key: sourceSystemKey,
      p_event_id: eventId,
      p_event_type: "entitlement.granted",
      p_payload: payload,
      p_payload_hash: hash,
      p_event_version: "1",
    });
    if (resendError) throw resendError;
    expect((resend as { claim_outcome: string }[])[0].claim_outcome).toBe("duplicate");
  });

  it("同一event_id+異なるpayload_hashはconflictになる", async () => {
    const client = getTestSupabaseClient();
    const sourceSystemKey = "sen-no-kuni-hub-test";
    const eventId = `evt-${crypto.randomUUID()}`;
    createdKeys.push({ sourceSystemKey, eventId });

    const { error: firstError } = await client.rpc("claim_integration_inbox_event", {
      p_source_system_key: sourceSystemKey,
      p_event_id: eventId,
      p_event_type: "entitlement.granted",
      p_payload: { hello: "world" },
      p_payload_hash: payloadHash({ hello: "world" }),
      p_event_version: "1",
    });
    if (firstError) throw firstError;

    const { data: conflictAttempt, error: conflictError } = await client.rpc("claim_integration_inbox_event", {
      p_source_system_key: sourceSystemKey,
      p_event_id: eventId,
      p_event_type: "entitlement.granted",
      p_payload: { hello: "different-payload" },
      p_payload_hash: payloadHash({ hello: "different-payload" }),
      p_event_version: "1",
    });
    if (conflictError) throw conflictError;
    expect((conflictAttempt as { claim_outcome: string }[])[0].claim_outcome).toBe("conflict");
  });
});
