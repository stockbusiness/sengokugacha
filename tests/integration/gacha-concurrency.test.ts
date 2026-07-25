import { afterEach, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, getTestSupabaseClient, hasIntegrationTestDatabase } from "./support/env";

// 千ノ国パスポート Phase C-0(§9 ガチャ統合テスト)。
// execute_gacha_draw()を同一ユーザー・同一business_dateで20並列呼び出しし、
// 日次上限を超えて成功しないこと、有料ガチャでガチャ券消費が残高以上に進まないことを検証する。
// supabase/seed.sqlが投入するテスト国(00000000-0000-0000-0000-000000000001)と
// テスト武将(...0011=common)を使う。

const TEST_PROVINCE_ID = "00000000-0000-0000-0000-000000000001";
const TEST_WARLORD_ID = "00000000-0000-0000-0000-000000000011";

describe.skipIf(!hasIntegrationTestDatabase())("execute_gacha_draw: 並行実行", () => {
  const createdUserIds: string[] = [];

  afterEach(async () => {
    const client = getTestSupabaseClient();
    for (const userId of createdUserIds.splice(0)) {
      await client.from("gacha_logs").delete().eq("user_id", userId);
      await client.from("gacha_daily_usage").delete().eq("user_id", userId);
      await client.from("user_warlords").delete().eq("user_id", userId);
      await client.from("user_activity").delete().eq("user_id", userId);
      await client.from("user_provinces").delete().eq("user_id", userId);
      await deleteTestUser(userId);
    }
  });

  it("無料ガチャ20並列は日次上限(5)を超えて成功しない", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser();
    createdUserIds.push(userId);
    const businessDate = "2026-07-25";
    const dailyLimit = 5;

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        client.rpc("execute_gacha_draw", {
          p_user_id: userId,
          p_draw_type: "free",
          p_business_date: businessDate,
          p_daily_limit: dailyLimit,
          p_selected_province_id: TEST_PROVINCE_ID,
          p_selected_warlord_id: TEST_WARLORD_ID,
          p_conquered_provinces_count_at_draw: 0,
          p_request_id: crypto.randomUUID(),
        })
      )
    );

    const succeeded = results.filter((r) => r.status === "fulfilled" && !r.value.error);
    const limitExceeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.error?.message?.includes("gacha_daily_limit_exceeded")
    );

    expect(succeeded).toHaveLength(dailyLimit);
    expect(limitExceeded).toHaveLength(20 - dailyLimit);

    const { data: usage, error: usageError } = await client
      .from("gacha_daily_usage")
      .select("draw_count")
      .eq("user_id", userId)
      .eq("business_date", businessDate)
      .eq("draw_type", "free")
      .single();
    if (usageError) throw usageError;
    expect(usage.draw_count).toBe(dailyLimit);
  });

  it("有料ガチャ20並列はガチャ券残高(3枚)以上に成功しない", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ gacha_tickets: 3 });
    createdUserIds.push(userId);
    const businessDate = "2026-07-25";

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        client.rpc("execute_gacha_draw", {
          p_user_id: userId,
          p_draw_type: "paid",
          p_business_date: businessDate,
          p_daily_limit: 9999,
          p_selected_province_id: TEST_PROVINCE_ID,
          p_selected_warlord_id: TEST_WARLORD_ID,
          p_conquered_provinces_count_at_draw: 0,
          p_request_id: crypto.randomUUID(),
        })
      )
    );

    const succeeded = results.filter((r) => r.status === "fulfilled" && !r.value.error);
    expect(succeeded).toHaveLength(3);

    const { data: user, error: userError } = await client.from("users").select("gacha_tickets").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.gacha_tickets).toBe(0);
  });

  it("同一request_idの再送は同じ結果を返す(副作用は再実行されない)", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser();
    createdUserIds.push(userId);
    const requestId = crypto.randomUUID();
    const call = () =>
      client.rpc("execute_gacha_draw", {
        p_user_id: userId,
        p_draw_type: "free",
        p_business_date: "2026-07-25",
        p_daily_limit: 5,
        p_selected_province_id: TEST_PROVINCE_ID,
        p_selected_warlord_id: TEST_WARLORD_ID,
        p_conquered_provinces_count_at_draw: 0,
        p_request_id: requestId,
      });

    const { data: first, error: firstError } = await call();
    if (firstError) throw firstError;
    const { data: second, error: secondError } = await call();
    if (secondError) throw secondError;

    expect((second as unknown[])[0]).toEqual((first as unknown[])[0]);

    const { data: usage, error: usageError } = await client
      .from("gacha_daily_usage")
      .select("draw_count")
      .eq("user_id", userId)
      .eq("business_date", "2026-07-25")
      .eq("draw_type", "free")
      .single();
    if (usageError) throw usageError;
    expect(usage.draw_count).toBe(1); // 2回目はリプレイのため加算されない
  });
});
