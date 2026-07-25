import { afterEach, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, getTestSupabaseClient, hasIntegrationTestDatabase } from "./support/env";

// 千ノ国パスポート Phase C-0(§6 購入権利付与テスト)。
// claim_purchase_grant_step()を同一purchase_id・同一step_keyで10並列呼び出しし、
// claimedになるのが1件だけであることを検証する。Supabase local(SUPABASE_TEST_URL等)
// が設定されていない環境ではスキップする(失敗ではない)。

describe.skipIf(!hasIntegrationTestDatabase())("claim_purchase_grant_step: 10並列claim", () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    const client = getTestSupabaseClient();
    for (const userId of createdUserIds.splice(0)) {
      await client.from("purchases").delete().eq("user_id", userId);
      await deleteTestUser(userId);
    }
  });

  it("同一purchase_id・同一step_keyへの10並列claimは1件だけclaimedになる", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser();
    createdUserIds.push(userId);

    const { data: purchase, error: purchaseError } = await client
      .from("purchases")
      .insert({
        user_id: userId,
        stripe_session_id: `test-session-${crypto.randomUUID()}`,
        item_type: "kokudaka",
        amount: 1000,
        status: "processing",
      })
      .select("id")
      .single();
    if (purchaseError) throw purchaseError;

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        client.rpc("claim_purchase_grant_step", {
          p_purchase_id: purchase.id,
          p_step_key: "balance_granted",
        })
      )
    );

    const outcomes = results.map((r) => {
      if (r.error) throw r.error;
      return (r.data as { claim_outcome: string }[])[0].claim_outcome;
    });

    expect(outcomes.filter((o) => o === "claimed")).toHaveLength(1);
    expect(outcomes.every((o) => o === "claimed" || o === "in_progress")).toBe(true);
  });

  it("claim token不一致のworkerはmark_purchase_grant_step_completedで更新できない", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser();
    createdUserIds.push(userId);

    const { data: purchase, error: purchaseError } = await client
      .from("purchases")
      .insert({
        user_id: userId,
        stripe_session_id: `test-session-${crypto.randomUUID()}`,
        item_type: "kokudaka",
        amount: 1000,
        status: "processing",
      })
      .select("id")
      .single();
    if (purchaseError) throw purchaseError;

    const { data: claimData, error: claimError } = await client.rpc("claim_purchase_grant_step", {
      p_purchase_id: purchase.id,
      p_step_key: "balance_granted",
    });
    if (claimError) throw claimError;
    const { step_row_id: stepRowId } = (claimData as { step_row_id: string; claim_token: string }[])[0];

    const bogusToken = "00000000-0000-0000-0000-000000000000";
    const { data: markData, error: markError } = await client.rpc("mark_purchase_grant_step_completed", {
      p_step_row_id: stepRowId,
      p_claim_token: bogusToken,
    });
    if (markError) throw markError;

    // 実装が真偽値・件数のいずれを返すかに関わらず、「completedへ更新されなかった」ことを
    // stepの状態を読み直して確認する(戻り値の形に依存しない検証)。
    expect(markData).toBeDefined();
    const { data: stepRow, error: stepError } = await client
      .from("purchase_grant_steps")
      .select("status")
      .eq("id", stepRowId)
      .single();
    if (stepError) throw stepError;
    expect(stepRow.status).not.toBe("completed");
  });
});
