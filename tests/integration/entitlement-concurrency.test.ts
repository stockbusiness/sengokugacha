import { afterEach, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, getTestSupabaseClient, hasIntegrationTestDatabase } from "./support/env";

// 千ノ国パスポート Phase C-0(§7 entitlementテスト)+ Phase C-0 PR4(§4)。
// process_entitlement_grant()/process_entitlement_revocation()の並行実行安全性、
// grant/revokeの順序逆転への耐性、lease/fencing、rollback、dismissed除外を検証する。

async function insertEntitlement(
  client: ReturnType<typeof getTestSupabaseClient>,
  overrides: Record<string, unknown>
) {
  const { data, error } = await client
    .from("entitlements")
    .insert({
      entitlement_id: `test-ent-${crypto.randomUUID()}`,
      common_user_id: "test-common-user",
      entitlement_type: "kokudaka",
      quantity: 100,
      source_system_key: "sen-no-kuni-hub-test",
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

describe.skipIf(!hasIntegrationTestDatabase())("process_entitlement_grant/revocation: 並行実行", () => {
  const createdUserIds: string[] = [];
  const createdEntitlementIds: string[] = [];

  afterEach(async () => {
    const client = getTestSupabaseClient();
    for (const id of createdEntitlementIds.splice(0)) {
      await client.from("entitlements").delete().eq("id", id);
    }
    for (const userId of createdUserIds.splice(0)) {
      await deleteTestUser(userId);
    }
  });

  it("同一entitlement行への10並列grantはkokudaka付与が1回分だけになる", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);
    const entitlementRowId = await insertEntitlement(client, { user_id: userId, quantity: 100 });
    createdEntitlementIds.push(entitlementRowId);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => client.rpc("process_entitlement_grant", { p_entitlement_row_id: entitlementRowId }))
    );
    const outcomes = results.map((r) => {
      if (r.error) throw r.error;
      return (r.data as { claim_outcome: string }[])[0].claim_outcome;
    });

    expect(outcomes.filter((o) => o === "claimed")).toHaveLength(1);

    const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.kokudaka).toBe(100); // 100が2回以上加算されていないこと
  });

  it("同一entitlement行への10並列revokeはreversedになる処理が1件だけになり、残高減算も1回になる", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);
    const entitlementRowId = await insertEntitlement(client, { user_id: userId, quantity: 100 });
    createdEntitlementIds.push(entitlementRowId);

    const { data: grantData, error: grantError } = await client.rpc("process_entitlement_grant", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (grantError) throw grantError;
    expect((grantData as { claim_outcome: string }[])[0].claim_outcome).toBe("claimed");

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        client.rpc("process_entitlement_revocation", { p_entitlement_row_id: entitlementRowId })
      )
    );
    const outcomes = results.map((r) => {
      if (r.error) throw r.error;
      return (r.data as { claim_outcome: string }[])[0].claim_outcome;
    });
    expect(outcomes.filter((o) => o === "claimed")).toHaveLength(1);
    expect(outcomes.every((o) => o === "claimed" || o === "already_reversed")).toBe(true);

    const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.kokudaka).toBe(0); // 100付与→100減算で0になっていること(2回以上減算されていないこと)

    const { data: entitlement, error: entitlementError } = await client
      .from("entitlements")
      .select("reversal_status, reversal_attempt_count, status")
      .eq("id", entitlementRowId)
      .single();
    if (entitlementError) throw entitlementError;
    expect(entitlement.reversal_status).toBe("reversed");
    expect(entitlement.status).toBe("revoked");
    expect(entitlement.reversal_attempt_count).toBe(1); // claimしたのは1件だけ
  });

  it("revoke→grant→revoke再送の順序逆転でも最終的にstatus=revoked・reversal_status=reversed・残高=0に収束する", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);
    const entitlementRowId = await insertEntitlement(client, { user_id: userId, quantity: 50 });
    createdEntitlementIds.push(entitlementRowId);

    // 1. revoke -> grant の順で呼ぶ(実運用でのイベント順序逆転を模する)。
    const { data: revokeBeforeGrant, error: revokeError } = await client.rpc("process_entitlement_revocation", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (revokeError) throw revokeError;
    expect((revokeBeforeGrant as { claim_outcome: string }[])[0].claim_outcome).toBe("reversed_without_balance_change");

    const { data: grantData, error: grantError } = await client.rpc("process_entitlement_grant", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (grantError) throw grantError;
    expect((grantData as { claim_outcome: string }[])[0].claim_outcome).toBe("claimed");

    const { data: userAfterGrant, error: userAfterGrantError } = await client
      .from("users")
      .select("kokudaka")
      .eq("id", userId)
      .single();
    if (userAfterGrantError) throw userAfterGrantError;
    expect(userAfterGrant.kokudaka).toBe(50); // grant自体は正常に残高反映される

    // 2. revoke再送。今度はapplication_statusが'applied'になっているため、実際に残高が減算される。
    const { data: revokeResend, error: revokeResendError } = await client.rpc("process_entitlement_revocation", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (revokeResendError) throw revokeResendError;
    expect((revokeResend as { claim_outcome: string }[])[0].claim_outcome).toBe("claimed");

    const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.kokudaka).toBe(0);

    const { data: entitlement, error: entitlementError } = await client
      .from("entitlements")
      .select("status, reversal_status")
      .eq("id", entitlementRowId)
      .single();
    if (entitlementError) throw entitlementError;
    expect(entitlement.status).toBe("revoked");
    expect(entitlement.reversal_status).toBe("reversed");
  });

  it("user_idがnullの場合はuser_unresolvedで保留され、後からresolveすると付与される", async () => {
    const client = getTestSupabaseClient();
    const entitlementRowId = await insertEntitlement(client, {
      user_id: null,
      common_user_id: "test-common-user-unresolved",
      quantity: 30,
    });
    createdEntitlementIds.push(entitlementRowId);

    const { data: firstAttempt, error: firstError } = await client.rpc("process_entitlement_grant", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (firstError) throw firstError;
    expect((firstAttempt as { claim_outcome: string }[])[0].claim_outcome).toBe("user_unresolved");

    const userId = await createTestUser({ kokudaka: 0, common_user_id: "test-common-user-unresolved" });
    createdUserIds.push(userId);

    const { data: retryAttempt, error: retryError } = await client.rpc("process_entitlement_grant", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (retryError) throw retryError;
    expect((retryAttempt as { claim_outcome: string; resolved_user_id: string }[])[0]).toMatchObject({
      claim_outcome: "claimed",
      resolved_user_id: userId,
    });
  });

  it("application claimのlease切れ後は別workerが再claimでき、古いclaim_tokenは拒否される", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);
    const entitlementRowId = await insertEntitlement(client, { user_id: userId, quantity: 100 });
    createdEntitlementIds.push(entitlementRowId);

    const { data: firstClaim, error: firstClaimError } = await client.rpc("claim_entitlement_application", {
      p_entitlement_row_id: entitlementRowId,
      p_lease_seconds: 1,
    });
    if (firstClaimError) throw firstClaimError;
    const oldToken = (firstClaim as { claim_outcome: string; claim_token: string }[])[0].claim_token;

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const { data: secondClaim, error: secondClaimError } = await client.rpc("claim_entitlement_application", {
      p_entitlement_row_id: entitlementRowId,
      p_lease_seconds: 300,
    });
    if (secondClaimError) throw secondClaimError;
    const { claim_outcome: secondOutcome, claim_token: newToken } = (
      secondClaim as { claim_outcome: string; claim_token: string }[]
    )[0];
    expect(secondOutcome).toBe("claimed");
    expect(newToken).not.toBe(oldToken);

    const { data: entitlement, error: entitlementError } = await client
      .from("entitlements")
      .select("application_claim_token")
      .eq("id", entitlementRowId)
      .single();
    if (entitlementError) throw entitlementError;
    expect(entitlement.application_claim_token).toBe(newToken); // 古いtokenはもう権威を持たない
    expect(entitlement.application_claim_token).not.toBe(oldToken);
  });

  it("reversal claimのlease切れ後は別workerが再claimでき、古いclaim_tokenは拒否される", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);
    const entitlementRowId = await insertEntitlement(client, { user_id: userId, quantity: 100 });
    createdEntitlementIds.push(entitlementRowId);

    const { data: firstClaim, error: firstClaimError } = await client.rpc("claim_entitlement_reversal", {
      p_entitlement_row_id: entitlementRowId,
      p_lease_seconds: 1,
    });
    if (firstClaimError) throw firstClaimError;
    const oldToken = (firstClaim as { claim_outcome: string; claim_token: string }[])[0].claim_token;

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const { data: secondClaim, error: secondClaimError } = await client.rpc("claim_entitlement_reversal", {
      p_entitlement_row_id: entitlementRowId,
      p_lease_seconds: 300,
    });
    if (secondClaimError) throw secondClaimError;
    const { claim_outcome: secondOutcome, claim_token: newToken } = (
      secondClaim as { claim_outcome: string; claim_token: string }[]
    )[0];
    expect(secondOutcome).toBe("claimed");
    expect(newToken).not.toBe(oldToken);

    const { data: entitlement, error: entitlementError } = await client
      .from("entitlements")
      .select("reversal_claim_token")
      .eq("id", entitlementRowId)
      .single();
    if (entitlementError) throw entitlementError;
    expect(entitlement.reversal_claim_token).toBe(newToken);
  });

  it("attempt上限に達するとdeadになり、それ以降は自動再試行されない", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);
    const entitlementRowId = await insertEntitlement(client, { user_id: userId, quantity: 100 });
    createdEntitlementIds.push(entitlementRowId);

    // p_lease_seconds=0で即座にlease切れにし、p_max_attempts=1で1回claimした時点で
    // 上限へ到達させる(claimのたびにattempt_countが増える)。
    const { data: firstClaim, error: firstClaimError } = await client.rpc("claim_entitlement_application", {
      p_entitlement_row_id: entitlementRowId,
      p_lease_seconds: 0,
      p_max_attempts: 1,
    });
    if (firstClaimError) throw firstClaimError;
    expect((firstClaim as { claim_outcome: string }[])[0].claim_outcome).toBe("claimed");

    const { data: secondClaim, error: secondClaimError } = await client.rpc("claim_entitlement_application", {
      p_entitlement_row_id: entitlementRowId,
      p_lease_seconds: 0,
      p_max_attempts: 1,
    });
    if (secondClaimError) throw secondClaimError;
    expect((secondClaim as { claim_outcome: string }[])[0].claim_outcome).toBe("dead");

    // dead状態になった後は、通常のp_max_attempts(既定10)で呼んでも自動的には再試行されない。
    const { data: thirdClaim, error: thirdClaimError } = await client.rpc("claim_entitlement_application", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (thirdClaimError) throw thirdClaimError;
    expect((thirdClaim as { claim_outcome: string }[])[0].claim_outcome).toBe("dead");
  });

  it("grant途中で失敗した場合、claimごと全てロールバックされ、再送で復旧できる", async () => {
    const client = getTestSupabaseClient();
    const entitlementRowId = await insertEntitlement(client, { user_id: null, quantity: 100 });
    createdEntitlementIds.push(entitlementRowId);

    const { error } = await client.rpc("_test_only_force_fail_after_entitlement_application_claim", {
      p_entitlement_row_id: entitlementRowId,
    });
    expect(error).not.toBeNull();

    const { data: entitlementAfterFailure, error: fetchError } = await client
      .from("entitlements")
      .select("application_status, application_attempt_count")
      .eq("id", entitlementRowId)
      .single();
    if (fetchError) throw fetchError;
    // claim_entitlement_application()による'applying'遷移・attempt_count増加ごと
    // ロールバックされ、application_statusは初期値のままであること。
    expect(entitlementAfterFailure.application_status).toBe("not_applied");
    expect(entitlementAfterFailure.application_attempt_count).toBe(0);

    // 再送(通常のprocess_entitlement_grant)で正常に復旧できること。
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);
    await client.from("entitlements").update({ user_id: userId }).eq("id", entitlementRowId);
    const { data: retry, error: retryError } = await client.rpc("process_entitlement_grant", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (retryError) throw retryError;
    expect((retry as { claim_outcome: string }[])[0].claim_outcome).toBe("claimed");
  });

  it("revoke途中で失敗した場合、claimごと全てロールバックされ、再送で復旧できる", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);
    const entitlementRowId = await insertEntitlement(client, { user_id: userId, quantity: 100 });
    createdEntitlementIds.push(entitlementRowId);

    const { data: grantData, error: grantError } = await client.rpc("process_entitlement_grant", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (grantError) throw grantError;
    expect((grantData as { claim_outcome: string }[])[0].claim_outcome).toBe("claimed");

    const { error } = await client.rpc("_test_only_force_fail_after_entitlement_reversal_claim", {
      p_entitlement_row_id: entitlementRowId,
    });
    expect(error).not.toBeNull();

    const { data: entitlementAfterFailure, error: fetchError } = await client
      .from("entitlements")
      .select("reversal_status, reversal_attempt_count")
      .eq("id", entitlementRowId)
      .single();
    if (fetchError) throw fetchError;
    expect(entitlementAfterFailure.reversal_status).toBe("not_reversed");
    expect(entitlementAfterFailure.reversal_attempt_count).toBe(0);

    const { data: userAfterFailure, error: userAfterFailureError } = await client
      .from("users")
      .select("kokudaka")
      .eq("id", userId)
      .single();
    if (userAfterFailureError) throw userAfterFailureError;
    expect(userAfterFailure.kokudaka).toBe(100); // 残高は減算されていない(不整合が残らない)

    // 再送で正常に復旧できること。
    const { data: retry, error: retryError } = await client.rpc("process_entitlement_revocation", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (retryError) throw retryError;
    expect((retry as { claim_outcome: string }[])[0].claim_outcome).toBe("claimed");
    const { data: userAfterRetry, error: userAfterRetryError } = await client
      .from("users")
      .select("kokudaka")
      .eq("id", userId)
      .single();
    if (userAfterRetryError) throw userAfterRetryError;
    expect(userAfterRetry.kokudaka).toBe(0);
  });

  it("却下(dismissed)されたentitlementは個別に再解決を試みても処理されず、却下記録は保持される", async () => {
    const client = getTestSupabaseClient();
    const entitlementRowId = await insertEntitlement(client, {
      user_id: null,
      common_user_id: "test-common-user-dismissed",
      quantity: 40,
    });
    createdEntitlementIds.push(entitlementRowId);

    const dismissedAt = new Date().toISOString();
    await client
      .from("entitlements")
      .update({
        resolution_dismissed_at: dismissedAt,
        resolution_dismissed_by: "test-manager",
        resolution_dismissal_note: "送信元common_user_idが恒久的に誤っているため却下",
      })
      .eq("id", entitlementRowId);

    // common_user_idを解決できるユーザーを後から作っても、却下済みなら処理されない。
    const userId = await createTestUser({ kokudaka: 0, common_user_id: "test-common-user-dismissed" });
    createdUserIds.push(userId);

    const { data: retryAttempt, error: retryError } = await client.rpc("process_entitlement_grant", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (retryError) throw retryError;
    expect((retryAttempt as { claim_outcome: string }[])[0].claim_outcome).toBe("dismissed");

    const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.kokudaka).toBe(0); // 処理されていないこと

    const { data: entitlement, error: entitlementError } = await client
      .from("entitlements")
      .select("resolution_dismissed_at, resolution_dismissed_by, resolution_dismissal_note, application_status")
      .eq("id", entitlementRowId)
      .single();
    if (entitlementError) throw entitlementError;
    expect(entitlement.resolution_dismissed_at).not.toBeNull();
    expect(entitlement.resolution_dismissed_by).toBe("test-manager");
    expect(entitlement.resolution_dismissal_note).toBe("送信元common_user_idが恒久的に誤っているため却下");
    expect(entitlement.application_status).toBe("not_applied");
  });
});
