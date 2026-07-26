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

  it("source_system_keyが異なれば同一event_idでも別イベントとして扱われる(conflictにならない)", async () => {
    const client = getTestSupabaseClient();
    const eventId = `evt-${crypto.randomUUID()}`;
    createdKeys.push({ sourceSystemKey: "sen-no-kuni-hub-test", eventId });
    createdKeys.push({ sourceSystemKey: "sen-no-kuni-hub-test-other", eventId });

    const { data: first, error: firstError } = await client.rpc("claim_integration_inbox_event", {
      p_source_system_key: "sen-no-kuni-hub-test",
      p_event_id: eventId,
      p_event_type: "entitlement.granted",
      p_payload: { hello: "world" },
      p_payload_hash: payloadHash({ hello: "world" }),
      p_event_version: "1",
    });
    if (firstError) throw firstError;
    expect((first as { claim_outcome: string }[])[0].claim_outcome).toBe("new");

    const { data: second, error: secondError } = await client.rpc("claim_integration_inbox_event", {
      p_source_system_key: "sen-no-kuni-hub-test-other",
      p_event_id: eventId,
      p_event_type: "entitlement.granted",
      p_payload: { hello: "completely different payload" },
      p_payload_hash: payloadHash({ hello: "completely different payload" }),
      p_event_version: "1",
    });
    if (secondError) throw secondError;
    expect((second as { claim_outcome: string }[])[0].claim_outcome).toBe("new"); // conflictにならない
  });

  it("event_versionが保存される", async () => {
    const client = getTestSupabaseClient();
    const sourceSystemKey = "sen-no-kuni-hub-test";
    const eventId = `evt-${crypto.randomUUID()}`;
    createdKeys.push({ sourceSystemKey, eventId });

    const { error } = await client.rpc("claim_integration_inbox_event", {
      p_source_system_key: sourceSystemKey,
      p_event_id: eventId,
      p_event_type: "entitlement.granted",
      p_payload: { hello: "world" },
      p_payload_hash: payloadHash({ hello: "world" }),
      p_event_version: "2",
    });
    if (error) throw error;

    const { data: row, error: rowError } = await client
      .from("integration_inbox_events")
      .select("event_version")
      .eq("source_system_key", sourceSystemKey)
      .eq("event_id", eventId)
      .single();
    if (rowError) throw rowError;
    expect(row.event_version).toBe("2");
  });

  it("failedの後の再claimはnewとして再試行でき、attempt上限に達するとdeadになる", async () => {
    const client = getTestSupabaseClient();
    const sourceSystemKey = "sen-no-kuni-hub-test";
    const eventId = `evt-${crypto.randomUUID()}`;
    createdKeys.push({ sourceSystemKey, eventId });
    const payload = { hello: "world" };
    const hash = payloadHash(payload);

    const { data: firstClaim, error: firstError } = await client.rpc("claim_integration_inbox_event", {
      p_source_system_key: sourceSystemKey,
      p_event_id: eventId,
      p_event_type: "entitlement.granted",
      p_payload: payload,
      p_payload_hash: hash,
      p_event_version: "1",
      p_max_attempts: 2,
    });
    if (firstError) throw firstError;
    const first = (firstClaim as { claim_outcome: string; event_row_id: string }[])[0];
    expect(first.claim_outcome).toBe("new");

    const { data: row1, error: row1Error } = await client
      .from("integration_inbox_events")
      .select("claim_token, attempt_count")
      .eq("id", first.event_row_id)
      .single();
    if (row1Error) throw row1Error;
    expect(row1.attempt_count).toBe(1);

    const { data: failed1, error: failed1Error } = await client.rpc("mark_integration_inbox_failed", {
      p_event_row_id: first.event_row_id,
      p_claim_token: row1.claim_token,
      p_error: "test failure 1",
    });
    if (failed1Error) throw failed1Error;
    expect(failed1).toBe(true);

    const secondToken = crypto.randomUUID();
    const { data: secondClaim, error: secondError } = await client.rpc("claim_integration_inbox_event", {
      p_source_system_key: sourceSystemKey,
      p_event_id: eventId,
      p_event_type: "entitlement.granted",
      p_payload: payload,
      p_payload_hash: hash,
      p_event_version: "1",
      p_claim_token: secondToken,
      p_max_attempts: 2,
    });
    if (secondError) throw secondError;
    expect((secondClaim as { claim_outcome: string }[])[0].claim_outcome).toBe("new"); // 再試行(既存契約どおりnewのまま)

    const { data: failed2, error: failed2Error } = await client.rpc("mark_integration_inbox_failed", {
      p_event_row_id: first.event_row_id,
      p_claim_token: secondToken,
      p_error: "test failure 2",
    });
    if (failed2Error) throw failed2Error;
    expect(failed2).toBe(true);

    // attempt_count(2)がp_max_attempts(2)に達しているため、次のclaimはdeadになる。
    const { data: thirdClaim, error: thirdError } = await client.rpc("claim_integration_inbox_event", {
      p_source_system_key: sourceSystemKey,
      p_event_id: eventId,
      p_event_type: "entitlement.granted",
      p_payload: payload,
      p_payload_hash: hash,
      p_event_version: "1",
      p_max_attempts: 2,
    });
    if (thirdError) throw thirdError;
    expect((thirdClaim as { claim_outcome: string }[])[0].claim_outcome).toBe("dead");
  });

  it("lease切れ後は別workerが再claimでき、古いclaim_tokenでは完了・失敗のどちらも更新できない", async () => {
    const client = getTestSupabaseClient();
    const sourceSystemKey = "sen-no-kuni-hub-test";
    const eventId = `evt-${crypto.randomUUID()}`;
    createdKeys.push({ sourceSystemKey, eventId });
    const payload = { hello: "world" };
    const hash = payloadHash(payload);
    const oldToken = crypto.randomUUID();

    const { data: firstClaim, error: firstError } = await client.rpc("claim_integration_inbox_event", {
      p_source_system_key: sourceSystemKey,
      p_event_id: eventId,
      p_event_type: "entitlement.granted",
      p_payload: payload,
      p_payload_hash: hash,
      p_event_version: "1",
      p_claim_token: oldToken,
      p_lease_seconds: 1,
    });
    if (firstError) throw firstError;
    const { event_row_id: eventRowId } = (firstClaim as { claim_outcome: string; event_row_id: string }[])[0];

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const newToken = crypto.randomUUID();
    const { data: secondClaim, error: secondError } = await client.rpc("claim_integration_inbox_event", {
      p_source_system_key: sourceSystemKey,
      p_event_id: eventId,
      p_event_type: "entitlement.granted",
      p_payload: payload,
      p_payload_hash: hash,
      p_event_version: "1",
      p_claim_token: newToken,
      p_lease_seconds: 300,
    });
    if (secondError) throw secondError;
    expect((secondClaim as { claim_outcome: string }[])[0].claim_outcome).toBe("new");

    const { data: succeededByOldToken, error: succeededByOldTokenError } = await client.rpc(
      "mark_integration_inbox_succeeded",
      { p_event_row_id: eventRowId, p_claim_token: oldToken }
    );
    if (succeededByOldTokenError) throw succeededByOldTokenError;
    expect(succeededByOldToken).toBe(false);

    const { data: failedByOldToken, error: failedByOldTokenError } = await client.rpc("mark_integration_inbox_failed", {
      p_event_row_id: eventRowId,
      p_claim_token: oldToken,
      p_error: "stale worker",
    });
    if (failedByOldTokenError) throw failedByOldTokenError;
    expect(failedByOldToken).toBe(false);

    const { data: succeededByNewToken, error: succeededByNewTokenError } = await client.rpc(
      "mark_integration_inbox_succeeded",
      { p_event_row_id: eventRowId, p_claim_token: newToken }
    );
    if (succeededByNewTokenError) throw succeededByNewTokenError;
    expect(succeededByNewToken).toBe(true);
  });
});
