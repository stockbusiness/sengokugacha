import { afterEach, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, getTestSupabaseClient, hasIntegrationTestDatabase } from "./support/env";

// 千ノ国パスポート Phase C-0 PR4(§3 Purchase Grant統合テスト)。
// apply_purchase_balance_grant()/record_purchase_agent_sale()(20260808000002)を
// 対象に、残高付与・agent_sales記録の並行実行安全性、claim_purchase_grant_step()の
// lease/fencing、および失敗時のtrue all-or-nothingロールバックを検証する。

async function insertPurchase(
  client: ReturnType<typeof getTestSupabaseClient>,
  overrides: Record<string, unknown>
): Promise<string> {
  const { data, error } = await client
    .from("purchases")
    .insert({
      stripe_session_id: `test-session-${crypto.randomUUID()}`,
      item_type: "kokudaka",
      amount: 1000,
      grant_amount: 500,
      status: "processing",
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

describe.skipIf(!hasIntegrationTestDatabase())("apply_purchase_balance_grant/record_purchase_agent_sale: 並行実行", () => {
  const createdUserIds: string[] = [];
  const createdPurchaseIds: string[] = [];
  const createdAgentIds: string[] = [];

  afterEach(async () => {
    const client = getTestSupabaseClient();
    for (const purchaseId of createdPurchaseIds.splice(0)) {
      await client.from("purchase_grant_steps").delete().eq("purchase_id", purchaseId);
      await client.from("agent_sales").delete().eq("purchase_id", purchaseId);
      await client.from("purchases").delete().eq("id", purchaseId);
    }
    for (const userId of createdUserIds.splice(0)) {
      await deleteTestUser(userId);
    }
    for (const agentId of createdAgentIds.splice(0)) {
      await client.from("agents").delete().eq("id", agentId);
    }
  });

  it("同一purchase_idへの10並列grantはkokudaka付与が1回分になる", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);
    const purchaseId = await insertPurchase(client, { user_id: userId, item_type: "kokudaka", grant_amount: 500 });
    createdPurchaseIds.push(purchaseId);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        client.rpc("apply_purchase_balance_grant", {
          p_purchase_id: purchaseId,
          p_user_id: userId,
          p_column: "kokudaka",
          p_delta: 500,
        })
      )
    );
    const outcomes = results.map((r) => {
      if (r.error) throw r.error;
      return (r.data as { claim_outcome: string }[])[0].claim_outcome;
    });
    expect(outcomes.filter((o) => o === "claimed")).toHaveLength(1);
    expect(outcomes.every((o) => o === "claimed" || o === "already_completed")).toBe(true);

    const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.kokudaka).toBe(500);

    const { data: step, error: stepError } = await client
      .from("purchase_grant_steps")
      .select("status, attempt_count")
      .eq("purchase_id", purchaseId)
      .eq("step_key", "balance_granted")
      .single();
    if (stepError) throw stepError;
    expect(step.status).toBe("completed");
    expect(step.attempt_count).toBe(1);

    // 同一purchaseへの再実行(例: 手動retry-grant)でも残高は増えない。
    const { data: replay, error: replayError } = await client.rpc("apply_purchase_balance_grant", {
      p_purchase_id: purchaseId,
      p_user_id: userId,
      p_column: "kokudaka",
      p_delta: 500,
    });
    if (replayError) throw replayError;
    expect((replay as { claim_outcome: string }[])[0].claim_outcome).toBe("already_completed");
    const { data: userAfterReplay, error: userAfterReplayError } = await client
      .from("users")
      .select("kokudaka")
      .eq("id", userId)
      .single();
    if (userAfterReplayError) throw userAfterReplayError;
    expect(userAfterReplay.kokudaka).toBe(500);
  });

  it("同一purchase_idへの10並列grantはgacha_tickets付与が1回分になる", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ gacha_tickets: 0 });
    createdUserIds.push(userId);
    const purchaseId = await insertPurchase(client, {
      user_id: userId,
      item_type: "gacha_ticket",
      grant_amount: 3,
    });
    createdPurchaseIds.push(purchaseId);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        client.rpc("apply_purchase_balance_grant", {
          p_purchase_id: purchaseId,
          p_user_id: userId,
          p_column: "gacha_tickets",
          p_delta: 3,
        })
      )
    );
    const outcomes = results.map((r) => {
      if (r.error) throw r.error;
      return (r.data as { claim_outcome: string }[])[0].claim_outcome;
    });
    expect(outcomes.filter((o) => o === "claimed")).toHaveLength(1);

    const { data: user, error: userError } = await client.from("users").select("gacha_tickets").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.gacha_tickets).toBe(3);
  });

  it("record_purchase_agent_sale 10並列はagent_salesが1件になり、unique違反が露出しない", async () => {
    const client = getTestSupabaseClient();
    const { data: agent, error: agentError } = await client
      .from("agents")
      .insert({ name: "テスト代理店", referral_code: `test-agent-${crypto.randomUUID()}` })
      .select("id")
      .single();
    if (agentError) throw agentError;
    createdAgentIds.push(agent.id as string);

    const userId = await createTestUser({ referring_agent_id: agent.id });
    createdUserIds.push(userId);
    const purchaseId = await insertPurchase(client, { user_id: userId, item_type: "kokudaka", grant_amount: 500 });
    createdPurchaseIds.push(purchaseId);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        client.rpc("record_purchase_agent_sale", {
          p_purchase_id: purchaseId,
          p_user_id: userId,
          p_item_type: "kokudaka",
          p_amount: 1000,
        })
      )
    );
    // unique違反(agent_salesのpurchase_id部分unique index)がエラーとして露出しないこと。
    for (const r of results) {
      expect(r.error).toBeNull();
    }
    const outcomes = results.map((r) => (r.data as { claim_outcome: string }[])[0].claim_outcome);
    expect(outcomes.filter((o) => o === "claimed")).toHaveLength(1);

    const { data: sales, error: salesError } = await client.from("agent_sales").select("id").eq("purchase_id", purchaseId);
    if (salesError) throw salesError;
    expect(sales).toHaveLength(1);

    // 既存agent_sales行がある(=既にcompleted)状態での再実行は冪等成功する。
    const { data: replay, error: replayError } = await client.rpc("record_purchase_agent_sale", {
      p_purchase_id: purchaseId,
      p_user_id: userId,
      p_item_type: "kokudaka",
      p_amount: 1000,
    });
    if (replayError) throw replayError;
    expect((replay as { claim_outcome: string }[])[0].claim_outcome).toBe("already_completed");
    const { data: salesAfterReplay, error: salesAfterReplayError } = await client
      .from("agent_sales")
      .select("id")
      .eq("purchase_id", purchaseId);
    if (salesAfterReplayError) throw salesAfterReplayError;
    expect(salesAfterReplay).toHaveLength(1);
  });

  it("lease切れ後は別workerが再claimでき、古いclaim_tokenでは完了・失敗のどちらも更新できない", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser();
    createdUserIds.push(userId);
    const purchaseId = await insertPurchase(client, { user_id: userId });
    createdPurchaseIds.push(purchaseId);

    const { data: firstClaim, error: firstClaimError } = await client.rpc("claim_purchase_grant_step", {
      p_purchase_id: purchaseId,
      p_step_key: "balance_granted",
      p_lease_seconds: 1,
    });
    if (firstClaimError) throw firstClaimError;
    const { step_row_id: stepRowId, claim_token: oldToken } = (
      firstClaim as { step_row_id: string; claim_token: string }[]
    )[0];

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const { data: secondClaim, error: secondClaimError } = await client.rpc("claim_purchase_grant_step", {
      p_purchase_id: purchaseId,
      p_step_key: "balance_granted",
      p_lease_seconds: 300,
    });
    if (secondClaimError) throw secondClaimError;
    const { claim_outcome: secondOutcome, claim_token: newToken } = (
      secondClaim as { claim_outcome: string; claim_token: string }[]
    )[0];
    expect(secondOutcome).toBe("claimed");
    expect(newToken).not.toBe(oldToken);

    const { data: completedByOldToken, error: completedByOldTokenError } = await client.rpc(
      "mark_purchase_grant_step_completed",
      { p_step_row_id: stepRowId, p_claim_token: oldToken }
    );
    if (completedByOldTokenError) throw completedByOldTokenError;
    expect(completedByOldToken).toBe(false);

    const { data: failedByOldToken, error: failedByOldTokenError } = await client.rpc("mark_purchase_grant_step_failed", {
      p_step_row_id: stepRowId,
      p_claim_token: oldToken,
      p_error: "stale worker",
    });
    if (failedByOldTokenError) throw failedByOldTokenError;
    expect(failedByOldToken).toBe(false);

    const { data: completedByNewToken, error: completedByNewTokenError } = await client.rpc(
      "mark_purchase_grant_step_completed",
      { p_step_row_id: stepRowId, p_claim_token: newToken }
    );
    if (completedByNewTokenError) throw completedByNewTokenError;
    expect(completedByNewToken).toBe(true);

    const { data: step, error: stepError } = await client
      .from("purchase_grant_steps")
      .select("status")
      .eq("id", stepRowId)
      .single();
    if (stepError) throw stepError;
    expect(step.status).toBe("completed");
  });

  it("apply_purchase_balance_grantが失敗した場合、claimごと全てロールバックされる(true all-or-nothing)", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);
    const purchaseId = await insertPurchase(client, { user_id: userId });
    createdPurchaseIds.push(purchaseId);

    const { error } = await client.rpc("apply_purchase_balance_grant", {
      p_purchase_id: purchaseId,
      p_user_id: userId,
      p_column: "not_a_real_column",
      p_delta: 500,
    });
    expect(error).not.toBeNull();

    // 例外発生前にネスト呼び出しされたclaim_purchase_grant_step()のpending行insertごと
    // トランザクション全体がロールバックされ、stepの行自体が存在しないこと。
    const { data: steps, error: stepsError } = await client
      .from("purchase_grant_steps")
      .select("id")
      .eq("purchase_id", purchaseId)
      .eq("step_key", "balance_granted");
    if (stepsError) throw stepsError;
    expect(steps).toHaveLength(0);

    const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.kokudaka).toBe(0);
  });
});
