import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, getTestSupabaseClient, hasIntegrationTestDatabase } from "./support/env";
import { createEntitlementRollbackTestHelpers, dropEntitlementRollbackTestHelpers } from "./support/test-only-db-functions";

// 千ノ国パスポート Phase C-0(§7 entitlementテスト)+ Phase C-0 PR4(§4)+
// マージ前最終修正指示§1(revoke先行の順序逆転をrevoke再送に頼らず1回のgrant呼び出しで
// 自動収束させる)。
// process_entitlement_grant()/process_entitlement_revocation()の並行実行安全性、
// grant/revokeの順序逆転への耐性、lease/fencing、rollback、dismissed除外を検証する。

// PR-P2a。残高への適用は entitlement_source_allowlist に登録された送信元に限られる。
// 本スイートは並行実行・fencing・rollback の検証が目的で、そのためには残高適用が
// 実際に動く必要があるため、テストDBへこの送信元を登録してから実行する。
const TEST_SOURCE_SYSTEM_KEY = "sen-no-kuni-hub-test";

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
      source_system_key: TEST_SOURCE_SYSTEM_KEY,
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

  // マージ前最終修正指示§2。rollbackテスト専用のDB関数は通常migrationに含めず、
  // このテストスイート開始時にテストDBへ動的作成し、終了時に必ずDROPする
  // (本番/ステージングDBへテスト専用関数を残さない)。
  beforeAll(async () => {
    createEntitlementRollbackTestHelpers();
    // PR-P2a。テスト専用関数と同じく、スイート終了時に必ず消す。
    const { error } = await getTestSupabaseClient()
      .from("entitlement_source_allowlist")
      .insert({ source_system_key: TEST_SOURCE_SYSTEM_KEY, note: "integration test", approved_by: "test" });
    if (error) throw error;
  });

  afterAll(async () => {
    dropEntitlementRollbackTestHelpers();
    await getTestSupabaseClient()
      .from("entitlement_source_allowlist")
      .delete()
      .eq("source_system_key", TEST_SOURCE_SYSTEM_KEY);
  });

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

  it("revoke→grantだけで残高0に収束する(revoke再送を前提にしない、マージ前最終修正指示§1)", async () => {
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

    // 2. grant受信。revoke再送を待たず、この1回の呼び出しだけでgrant適用直後に
    // 自動で取消(残高減算)まで完結する。
    const { data: grantData, error: grantError } = await client.rpc("process_entitlement_grant", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (grantError) throw grantError;
    expect((grantData as { claim_outcome: string }[])[0].claim_outcome).toBe("claimed_then_reversed");

    const { data: userAfterGrant, error: userAfterGrantError } = await client
      .from("users")
      .select("kokudaka")
      .eq("id", userId)
      .single();
    if (userAfterGrantError) throw userAfterGrantError;
    expect(userAfterGrant.kokudaka).toBe(0); // 50付与→50減算が同一呼び出し内で完結し、純増減0

    const { data: entitlement, error: entitlementError } = await client
      .from("entitlements")
      .select("status, application_status, reversal_status")
      .eq("id", entitlementRowId)
      .single();
    if (entitlementError) throw entitlementError;
    expect(entitlement.status).toBe("revoked");
    expect(entitlement.application_status).toBe("applied");
    expect(entitlement.reversal_status).toBe("reversed");
  });

  it("revoke→grant→revoke再送でも残高0のまま(冪等)", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);
    const entitlementRowId = await insertEntitlement(client, { user_id: userId, quantity: 50 });
    createdEntitlementIds.push(entitlementRowId);

    const { error: revokeError } = await client.rpc("process_entitlement_revocation", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (revokeError) throw revokeError;

    const { data: grantData, error: grantError } = await client.rpc("process_entitlement_grant", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (grantError) throw grantError;
    expect((grantData as { claim_outcome: string }[])[0].claim_outcome).toBe("claimed_then_reversed");

    // 元のrevokeイベントが再送されてきても、既にreversed済みのため冪等に無視される。
    const { data: revokeResend, error: revokeResendError } = await client.rpc("process_entitlement_revocation", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (revokeResendError) throw revokeResendError;
    expect((revokeResend as { claim_outcome: string }[])[0].claim_outcome).toBe("already_reversed");

    const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.kokudaka).toBe(0);
  });

  it("user未解決の状態でrevokeが先着し、その後userが解決すると1回のgrant呼び出しで残高0に収束する", async () => {
    const client = getTestSupabaseClient();
    const commonUserId = `test-common-user-unresolved-revoke-${crypto.randomUUID()}`;
    const entitlementRowId = await insertEntitlement(client, { user_id: null, common_user_id: commonUserId, quantity: 70 });
    createdEntitlementIds.push(entitlementRowId);

    // user未解決のままrevokeが先着(残高への実効果は無いためスキップされる)。
    const { data: revokeData, error: revokeError } = await client.rpc("process_entitlement_revocation", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (revokeError) throw revokeError;
    expect((revokeData as { claim_outcome: string }[])[0].claim_outcome).toBe("reversed_without_balance_change");

    const { data: entitlementAfterRevoke, error: entitlementAfterRevokeError } = await client
      .from("entitlements")
      .select("status, reversal_status")
      .eq("id", entitlementRowId)
      .single();
    if (entitlementAfterRevokeError) throw entitlementAfterRevokeError;
    expect(entitlementAfterRevoke.status).toBe("revoked");
    expect(entitlementAfterRevoke.reversal_status).toBe("not_reversed");

    // userが後から解決する。
    const userId = await createTestUser({ kokudaka: 0, common_user_id: commonUserId });
    createdUserIds.push(userId);

    // grant再送(または初回受信の再試行)。user_id解決・残高付与・自動取消が1回で完結する。
    const { data: grantData, error: grantError } = await client.rpc("process_entitlement_grant", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (grantError) throw grantError;
    expect((grantData as { claim_outcome: string; resolved_user_id: string }[])[0]).toMatchObject({
      claim_outcome: "claimed_then_reversed",
      resolved_user_id: userId,
    });

    const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.kokudaka).toBe(0);

    const { data: entitlement, error: entitlementError } = await client
      .from("entitlements")
      .select("status, application_status, reversal_status")
      .eq("id", entitlementRowId)
      .single();
    if (entitlementError) throw entitlementError;
    expect(entitlement.status).toBe("revoked");
    expect(entitlement.application_status).toBe("applied");
    expect(entitlement.reversal_status).toBe("reversed");
  });

  it("10並列のgrant/revoke混在呼び出しでも、最終的にstatus=revoked・残高0へ安全に収束する", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);
    const entitlementRowId = await insertEntitlement(client, { user_id: userId, quantity: 40 });
    createdEntitlementIds.push(entitlementRowId);

    // grant/revokeの受信順序は保証されないため、5並列grant+5並列revokeを同時に
    // 発火し、どの順序で処理されても最終的に安全な状態へ収束することを確認する。
    const calls = [
      ...Array.from({ length: 5 }, () => client.rpc("process_entitlement_grant", { p_entitlement_row_id: entitlementRowId })),
      ...Array.from({ length: 5 }, () =>
        client.rpc("process_entitlement_revocation", { p_entitlement_row_id: entitlementRowId })
      ),
    ];
    const results = await Promise.all(calls);
    for (const r of results) {
      if (r.error) throw r.error;
    }

    const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
    if (userError) throw userError;
    // grantが先に成立していても、revokeが先に成立していても、最終的にrevoked状態に
    // 収束する以上は純増減0になっていなければならない(2重付与・2重減算・負の残高は不可)。
    expect(user.kokudaka).toBe(0);

    const { data: entitlement, error: entitlementError } = await client
      .from("entitlements")
      .select("status, application_status, reversal_status, application_attempt_count, reversal_attempt_count")
      .eq("id", entitlementRowId)
      .single();
    if (entitlementError) throw entitlementError;
    expect(entitlement.status).toBe("revoked");
    expect(entitlement.application_status).toBe("applied");
    expect(entitlement.reversal_status).toBe("reversed");
    // claimの原子性により、実際に残高へ効果を持つclaimはそれぞれ1回だけ成立しているはず。
    expect(entitlement.application_attempt_count).toBe(1);
    expect(entitlement.reversal_attempt_count).toBe(1);
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

  // PR-P2a。ここから下は allowlist そのものの検証。
  it("allowlist未登録の送信元からのkokudakaは、残高を動かさず理由が記録される", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);
    const entitlementRowId = await insertEntitlement(client, {
      user_id: userId,
      quantity: 100,
      source_system_key: "not-allowlisted-system",
    });
    createdEntitlementIds.push(entitlementRowId);

    const { data, error } = await client.rpc("process_entitlement_grant", { p_entitlement_row_id: entitlementRowId });
    if (error) throw error;
    expect((data as { claim_outcome: string }[])[0].claim_outcome).toBe("claimed");

    const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.kokudaka).toBe(0);

    const { data: entitlement, error: entitlementError } = await client
      .from("entitlements")
      .select("application_decision, application_decision_reason")
      .eq("id", entitlementRowId)
      .single();
    if (entitlementError) throw entitlementError;
    expect(entitlement.application_decision).toBe("SOURCE_NOT_ALLOWED");
    expect(entitlement.application_decision_reason).toContain("not-allowlisted-system");
  });

  // 本PRで一番危ないところ。allowlist は運用で変わるため、取消の時点で再判定すると
  // 「一度も入れていない残高を引く」ことになる。
  it("未登録のまま付与された権利は、後から送信元を承認しても取消で残高を引かない", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 300 });
    createdUserIds.push(userId);
    const entitlementRowId = await insertEntitlement(client, {
      user_id: userId,
      quantity: 100,
      source_system_key: "later-approved-system",
    });
    createdEntitlementIds.push(entitlementRowId);

    const { error: grantError } = await client.rpc("process_entitlement_grant", {
      p_entitlement_row_id: entitlementRowId,
    });
    if (grantError) throw grantError;

    // 運用が後から送信元を承認する。
    const { error: allowlistError } = await client
      .from("entitlement_source_allowlist")
      .insert({ source_system_key: "later-approved-system", note: "integration test", approved_by: "test" });
    if (allowlistError) throw allowlistError;

    try {
      const { data, error } = await client.rpc("process_entitlement_revocation", {
        p_entitlement_row_id: entitlementRowId,
      });
      if (error) throw error;
      expect((data as { claim_outcome: string }[])[0].claim_outcome).toBe("reversed_without_balance_change");

      const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
      if (userError) throw userError;
      expect(user.kokudaka).toBe(300); // 入れていない100が引かれていないこと
    } finally {
      await client.from("entitlement_source_allowlist").delete().eq("source_system_key", "later-approved-system");
    }
  });
});
