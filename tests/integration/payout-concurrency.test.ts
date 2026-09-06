import { afterEach, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, getTestSupabaseClient, hasIntegrationTestDatabase } from "./support/env";

// Passport実装指示書 PR-P1d「支払済み操作の排他と件数表示」。
//
// C3 の確認で、支払処理の3手(対象抽出・payouts作成・ledger更新)が同一トランザクション
// でも排他でもないことが分かった。同一受取者への同時実行で payouts が二重作成され、
// 支払総額が二重計上されうる状態だった。
//
// DB関数 create_payout_for_recipient() へ移し、対象行を for update でロックする。
// ここではその排他が実際に効くことを、実DBへの並列呼び出しで確認する。

describe.skipIf(!hasIntegrationTestDatabase())("create_payout_for_recipient: 排他", () => {
  const createdUserIds: string[] = [];
  const createdLedgerIds: string[] = [];
  const createdPayoutIds: string[] = [];
  const createdPurchaseIds: string[] = [];
  const createdRuleSetIds: string[] = [];

  afterEach(async () => {
    const client = getTestSupabaseClient();
    for (const id of createdLedgerIds.splice(0)) {
      await client.from("commission_ledger").delete().eq("id", id);
    }
    for (const id of createdPayoutIds.splice(0)) {
      await client.from("payouts").delete().eq("id", id);
    }
    for (const id of createdPurchaseIds.splice(0)) {
      await client.from("purchases").delete().eq("id", id);
    }
    for (const id of createdRuleSetIds.splice(0)) {
      await client.from("commission_rule_sets").delete().eq("id", id);
    }
    for (const userId of createdUserIds.splice(0)) {
      await deleteTestUser(userId);
    }
  });

  // commission_ledger は purchase_id / rule_set_id / base_amount_yen / rate が NOT NULL。
  // また UNIQUE(purchase_id, recipient_type) があるため、明細1件につき purchase を1件作る。
  async function seedConfirmedLines(userId: string, amounts: number[]) {
    const client = getTestSupabaseClient();

    const { data: ruleSet, error: ruleSetError } = await client
      .from("commission_rule_sets")
      .insert({
        name: `payout-concurrency-test-${crypto.randomUUID()}`,
        lord_rate: 0.1,
        agency_rate: 0.1,
        organization_rate: 0.1,
        regional_activity_rate: 0.1,
        development_fund_rate: 0.1,
        hq_rate: 0.1,
        status: "published",
      })
      .select("id")
      .single();
    if (ruleSetError) throw ruleSetError;
    createdRuleSetIds.push(ruleSet.id as string);

    for (const amount of amounts) {
      const { data: purchase, error: purchaseError } = await client
        .from("purchases")
        .insert({
          user_id: userId,
          stripe_session_id: `cs_test_${crypto.randomUUID()}`,
          item_type: "land_plot",
          amount,
          status: "completed",
        })
        .select("id")
        .single();
      if (purchaseError) throw purchaseError;
      createdPurchaseIds.push(purchase.id as string);

      const { data, error } = await client
        .from("commission_ledger")
        .insert({
          purchase_id: purchase.id,
          rule_set_id: ruleSet.id,
          recipient_type: "lord",
          recipient_user_id: userId,
          base_amount_yen: amount * 10,
          rate: 0.1,
          amount_yen: amount,
          status: "confirmed",
        })
        .select("id")
        .single();
      if (error) throw error;
      createdLedgerIds.push(data.id as string);
    }
  }

  async function callPayout(userId: string) {
    return getTestSupabaseClient().rpc("create_payout_for_recipient", {
      p_recipient_type: "lord",
      p_recipient_user_id: userId,
      p_recipient_agent_id: null,
      p_created_by: "integration-test",
    });
  }

  function rowOf(result: { data: unknown; error: unknown }) {
    if (result.error) throw result.error;
    return (result.data as { outcome: string; payout_id: string | null; line_count: number; total_amount_yen: number }[])[0];
  }

  it("対象3件を1回で支払うと payouts が1行、件数と合計が一致する", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({});
    createdUserIds.push(userId);
    await seedConfirmedLines(userId, [1000, 2000, 3000]);

    const row = rowOf(await callPayout(userId));
    if (row.payout_id) createdPayoutIds.push(row.payout_id);

    expect(row.outcome).toBe("created");
    expect(row.line_count).toBe(3);
    expect(Number(row.total_amount_yen)).toBe(6000);

    const { data: payouts, error } = await client
      .from("payouts")
      .select("id, total_amount_yen")
      .eq("recipient_user_id", userId);
    if (error) throw error;
    expect(payouts).toHaveLength(1);
    expect(payouts![0].total_amount_yen).toBe(6000);
  });

  // ここが本PRの要。以前は payouts が2行できて総額が二重計上された。
  it("同一受取者へ10並列で呼んでも payouts は1行だけになる", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({});
    createdUserIds.push(userId);
    await seedConfirmedLines(userId, [1000, 2000, 3000]);

    const results = await Promise.all(Array.from({ length: 10 }, () => callPayout(userId)));
    const rows = results.map(rowOf);
    for (const row of rows) {
      if (row.payout_id) createdPayoutIds.push(row.payout_id);
    }

    expect(rows.filter((r) => r.outcome === "created")).toHaveLength(1);
    expect(rows.filter((r) => r.outcome === "no_target")).toHaveLength(9);

    const { data: payouts, error } = await client
      .from("payouts")
      .select("id, total_amount_yen")
      .eq("recipient_user_id", userId);
    if (error) throw error;
    expect(payouts).toHaveLength(1);

    // payouts の合計と ledger の合計が食い違わないこと。
    const { data: lines, error: linesError } = await client
      .from("commission_ledger")
      .select("payout_id, status, amount_yen")
      .eq("recipient_user_id", userId);
    if (linesError) throw linesError;
    expect(lines!.every((l) => l.status === "paid")).toBe(true);
    expect(new Set(lines!.map((l) => l.payout_id)).size).toBe(1);
    expect(lines!.reduce((s, l) => s + (l.amount_yen as number), 0)).toBe(payouts![0].total_amount_yen);
  });

  it("対象0件なら no_target を返し、payouts に行を作らない", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({});
    createdUserIds.push(userId);

    const row = rowOf(await callPayout(userId));
    expect(row.outcome).toBe("no_target");
    expect(row.payout_id).toBeNull();
    expect(row.line_count).toBe(0);

    const { data: payouts } = await client.from("payouts").select("id").eq("recipient_user_id", userId);
    expect(payouts).toHaveLength(0);
  });

  it("支払済みの行は再処理されない", async () => {
    const userId = await createTestUser({});
    createdUserIds.push(userId);
    await seedConfirmedLines(userId, [5000]);

    const first = rowOf(await callPayout(userId));
    if (first.payout_id) createdPayoutIds.push(first.payout_id);
    expect(first.outcome).toBe("created");

    const second = rowOf(await callPayout(userId));
    expect(second.outcome).toBe("no_target");
  });

  // 受取者で絞ったうえでロックするので、別の受取者は待たされない。
  it("異なる受取者への支払は互いに独立して成功する", async () => {
    const userA = await createTestUser({});
    const userB = await createTestUser({});
    createdUserIds.push(userA, userB);
    await seedConfirmedLines(userA, [1000]);
    await seedConfirmedLines(userB, [2000]);

    const [a, b] = (await Promise.all([callPayout(userA), callPayout(userB)])).map(rowOf);
    if (a.payout_id) createdPayoutIds.push(a.payout_id);
    if (b.payout_id) createdPayoutIds.push(b.payout_id);

    expect(a.outcome).toBe("created");
    expect(b.outcome).toBe("created");
    expect(Number(a.total_amount_yen)).toBe(1000);
    expect(Number(b.total_amount_yen)).toBe(2000);
  });

  it("受取者が指定されていなければ invalid_recipient", async () => {
    const result = await getTestSupabaseClient().rpc("create_payout_for_recipient", {
      p_recipient_type: "lord",
      p_recipient_user_id: null,
      p_recipient_agent_id: null,
      p_created_by: "integration-test",
    });
    expect(rowOf(result).outcome).toBe("invalid_recipient");
  });
});
