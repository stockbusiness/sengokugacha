import { afterEach, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, getTestSupabaseClient, hasIntegrationTestDatabase } from "./support/env";

// 千ノ国パスポート Phase C-0 PR4(§7 ガチャ統合テスト追加)。
// execute_gacha_draw()(20260808000006、20260809000002で曖昧列参照を修正済み)を対象に、
// rollback・国制覇(conquest_rules有無・充足/未充足)・地方コンプ10並列・日付境界・
// 新規カード判定を検証する。美濃国・天下統一(src/lib/tenka-toitsu.ts、is_final_province=
// trueの実データ60国を要する)およびgacha_animations取得失敗時のフェイルセーフ
// (src/lib/gacha.tsで既にtry/catch実装済み、ソースコード実装済み区分)はこのDB関数の
// スコープ外のためここでは対象外とする(§14完了報告書に記載)。

const TEST_PROVINCE_ID = "00000000-0000-0000-0000-000000000001";
const TEST_WARLORD_COMMON_ID = "00000000-0000-0000-0000-000000000011";
const TEST_WARLORD_MID_ID = "00000000-0000-0000-0000-000000000012";
const TEST_WARLORD_RARE_ID = "00000000-0000-0000-0000-000000000013";

describe.skipIf(!hasIntegrationTestDatabase())("execute_gacha_draw: rollback・国制覇・日付境界・新規カード判定", () => {
  const createdUserIds: string[] = [];
  const createdRuleIds: string[] = [];

  afterEach(async () => {
    const client = getTestSupabaseClient();
    for (const ruleId of createdRuleIds.splice(0)) {
      await client.from("conquest_rule_warlords").delete().eq("rule_id", ruleId);
      await client.from("conquest_rules").delete().eq("id", ruleId);
    }
    for (const userId of createdUserIds.splice(0)) {
      await client.from("gacha_logs").delete().eq("user_id", userId);
      await client.from("gacha_daily_usage").delete().eq("user_id", userId);
      await client.from("user_warlords").delete().eq("user_id", userId);
      await client.from("user_activity").delete().eq("user_id", userId);
      await client.from("user_provinces").delete().eq("user_id", userId);
      await client.from("achievements").delete().eq("user_id", userId);
      await deleteTestUser(userId);
    }
  });

  it("存在しない武将IDを指定した場合、全ての副作用がロールバックされる(true all-or-nothing)", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0, gacha_tickets: 3, contribution_points: 0 });
    createdUserIds.push(userId);
    const nonexistentWarlordId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const businessDate = "2026-07-25";

    const { error } = await client.rpc("execute_gacha_draw", {
      p_user_id: userId,
      p_draw_type: "paid",
      p_business_date: businessDate,
      p_daily_limit: 9999,
      p_selected_province_id: TEST_PROVINCE_ID,
      p_selected_warlord_id: nonexistentWarlordId,
      p_conquered_provinces_count_at_draw: 0,
      p_request_id: crypto.randomUUID(),
    });
    expect(error).not.toBeNull(); // user_warlords.warlord_idの外部キー制約違反

    const { data: usage, error: usageError } = await client
      .from("gacha_daily_usage")
      .select("id")
      .eq("user_id", userId)
      .eq("business_date", businessDate);
    if (usageError) throw usageError;
    expect(usage).toHaveLength(0);

    const { data: logs, error: logsError } = await client.from("gacha_logs").select("id").eq("user_id", userId);
    if (logsError) throw logsError;
    expect(logs).toHaveLength(0);

    const { data: warlords, error: warlordsError } = await client.from("user_warlords").select("id").eq("user_id", userId);
    if (warlordsError) throw warlordsError;
    expect(warlords).toHaveLength(0);

    const { data: user, error: userError } = await client
      .from("users")
      .select("kokudaka, gacha_tickets, contribution_points")
      .eq("id", userId)
      .single();
    if (userError) throw userError;
    expect(user.kokudaka).toBe(0);
    expect(user.gacha_tickets).toBe(3); // 消費されていない
    expect(user.contribution_points).toBe(0);

    const { data: provinces, error: provincesError } = await client
      .from("user_provinces")
      .select("id")
      .eq("user_id", userId);
    if (provincesError) throw provincesError;
    expect(provinces).toHaveLength(0);

    const { data: achievementsRows, error: achievementsError } = await client
      .from("achievements")
      .select("id")
      .eq("user_id", userId);
    if (achievementsError) throw achievementsError;
    expect(achievementsRows).toHaveLength(0);
  });

  it("conquest_rulesが無い場合はその国の全武将所持で制圧され、必須武将未充足では制圧されない", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);
    const businessDate = "2026-07-25";

    // common枠のみ取得(mid/rare未取得) -> 未充足のため制圧されない。
    const { data: firstDraw, error: firstError } = await client.rpc("execute_gacha_draw", {
      p_user_id: userId,
      p_draw_type: "free",
      p_business_date: businessDate,
      p_daily_limit: 9999,
      p_selected_province_id: TEST_PROVINCE_ID,
      p_selected_warlord_id: TEST_WARLORD_COMMON_ID,
      p_conquered_provinces_count_at_draw: 0,
      p_request_id: crypto.randomUUID(),
    });
    if (firstError) throw firstError;
    expect((firstDraw as { province_conquered: boolean }[])[0].province_conquered).toBe(false);

    // mid枠を取得(まだrare未取得) -> 引き続き未充足。
    const { data: secondDraw, error: secondError } = await client.rpc("execute_gacha_draw", {
      p_user_id: userId,
      p_draw_type: "free",
      p_business_date: businessDate,
      p_daily_limit: 9999,
      p_selected_province_id: TEST_PROVINCE_ID,
      p_selected_warlord_id: TEST_WARLORD_MID_ID,
      p_conquered_provinces_count_at_draw: 0,
      p_request_id: crypto.randomUUID(),
    });
    if (secondError) throw secondError;
    expect((secondDraw as { province_conquered: boolean }[])[0].province_conquered).toBe(false);

    // rare枠を取得(3体全て所持) -> 制圧される。
    const { data: thirdDraw, error: thirdError } = await client.rpc("execute_gacha_draw", {
      p_user_id: userId,
      p_draw_type: "free",
      p_business_date: businessDate,
      p_daily_limit: 9999,
      p_selected_province_id: TEST_PROVINCE_ID,
      p_selected_warlord_id: TEST_WARLORD_RARE_ID,
      p_conquered_provinces_count_at_draw: 0,
      p_request_id: crypto.randomUUID(),
    });
    if (thirdError) throw thirdError;
    expect((thirdDraw as { province_conquered: boolean }[])[0].province_conquered).toBe(true);

    const { data: province, error: provinceError } = await client
      .from("user_provinces")
      .select("is_conquered")
      .eq("user_id", userId)
      .eq("province_id", TEST_PROVINCE_ID)
      .single();
    if (provinceError) throw provinceError;
    expect(province.is_conquered).toBe(true);
  });

  it("conquest_rulesがある場合はそちらを優先し、必須指定された武将のみで制圧判定する", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);

    // rare武将1体のみを必須とするconquest_ruleを設定する(common/midは不要)。
    const { data: rule, error: ruleError } = await client
      .from("conquest_rules")
      .insert({ province_id: TEST_PROVINCE_ID, rule_type: "all_specified", is_active: true })
      .select("id")
      .single();
    if (ruleError) throw ruleError;
    createdRuleIds.push(rule.id as string);
    const { error: ruleWarlordError } = await client
      .from("conquest_rule_warlords")
      .insert({ rule_id: rule.id, warlord_id: TEST_WARLORD_RARE_ID, is_required: true });
    if (ruleWarlordError) throw ruleWarlordError;

    const { data: draw, error: drawError } = await client.rpc("execute_gacha_draw", {
      p_user_id: userId,
      p_draw_type: "free",
      p_business_date: "2026-07-25",
      p_daily_limit: 9999,
      p_selected_province_id: TEST_PROVINCE_ID,
      p_selected_warlord_id: TEST_WARLORD_RARE_ID,
      p_conquered_provinces_count_at_draw: 0,
      p_request_id: crypto.randomUUID(),
    });
    if (drawError) throw drawError;
    // rare1体のみでconquest_rule充足のため、common/mid未所持でも制圧される。
    expect((draw as { province_conquered: boolean }[])[0].province_conquered).toBe(true);
  });

  it("既に制圧済みの国を再度制圧してもuser_provincesは重複しない", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);

    for (const warlordId of [TEST_WARLORD_COMMON_ID, TEST_WARLORD_MID_ID, TEST_WARLORD_RARE_ID]) {
      const { error } = await client.rpc("execute_gacha_draw", {
        p_user_id: userId,
        p_draw_type: "free",
        p_business_date: "2026-07-25",
        p_daily_limit: 9999,
        p_selected_province_id: TEST_PROVINCE_ID,
        p_selected_warlord_id: warlordId,
        p_conquered_provinces_count_at_draw: 0,
        p_request_id: crypto.randomUUID(),
      });
      if (error) throw error;
    }

    // 既に3体全て所持済み(=制圧済み)の状態で、同じ国の武将をもう一度引いても
    // user_provincesは重複作成されない(on conflict do update)。
    const { data: redrawResult, error: redrawError } = await client.rpc("execute_gacha_draw", {
      p_user_id: userId,
      p_draw_type: "free",
      p_business_date: "2026-07-25",
      p_daily_limit: 9999,
      p_selected_province_id: TEST_PROVINCE_ID,
      p_selected_warlord_id: TEST_WARLORD_COMMON_ID,
      p_conquered_provinces_count_at_draw: 1,
      p_request_id: crypto.randomUUID(),
    });
    if (redrawError) throw redrawError;
    expect((redrawResult as { province_conquered: boolean }[])[0].province_conquered).toBe(true);

    const { data: provinces, error: provincesError } = await client
      .from("user_provinces")
      .select("id")
      .eq("user_id", userId)
      .eq("province_id", TEST_PROVINCE_ID);
    if (provincesError) throw provincesError;
    expect(provinces).toHaveLength(1); // on conflict do updateにより重複しない
  });

  it("同一地方完成条件を10並列で満たしてもachievementは1件・地方石高ボーナスは1回だけ加算される", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser({ kokudaka: 0 });
    createdUserIds.push(userId);

    // common/mid枠を先に確保しておき、rare枠(最後の1枚)だけを10並列で取得させる。
    for (const warlordId of [TEST_WARLORD_COMMON_ID, TEST_WARLORD_MID_ID]) {
      const { error } = await client
        .from("user_warlords")
        .insert({ user_id: userId, warlord_id: warlordId, count: 1 });
      if (error) throw error;
    }

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        client.rpc("execute_gacha_draw", {
          p_user_id: userId,
          p_draw_type: "free",
          p_business_date: "2026-07-25",
          p_daily_limit: 9999,
          p_selected_province_id: TEST_PROVINCE_ID,
          p_selected_warlord_id: TEST_WARLORD_RARE_ID,
          p_conquered_provinces_count_at_draw: 0,
          p_request_id: crypto.randomUUID(),
        })
      )
    );
    for (const r of results) {
      if (r.error) throw r.error;
    }
    const regionCompletions = results.filter(
      (r) => (r.data as { region_completed: string | null }[])[0].region_completed !== null
    );
    // 地方コンプ達成のresponse自体は「今回の抽選で達成した」呼び出しのみ非null(achievement
    // 新規insertに成功した1件のみ)になる設計。
    expect(regionCompletions).toHaveLength(1);

    const { data: achievementsRows, error: achievementsError } = await client
      .from("achievements")
      .select("id")
      .eq("user_id", userId)
      .like("achievement_type", "region_complete_%");
    if (achievementsError) throw achievementsError;
    expect(achievementsRows).toHaveLength(1);

    const { data: user, error: userError } = await client.from("users").select("kokudaka").eq("id", userId).single();
    if (userError) throw userError;
    expect(user.kokudaka).toBe(100); // テスト地方は1国のみのためKOKUDAKA_BONUS_PER_PROVINCE(100)×1国分が1回だけ
  });

  it("日付境界: 異なるbusiness_dateでは日次上限がリセットされる(前日の利用回数を持ち越さない)", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser();
    createdUserIds.push(userId);
    const dailyLimit = 3;

    for (let i = 0; i < dailyLimit; i++) {
      const { error } = await client.rpc("execute_gacha_draw", {
        p_user_id: userId,
        p_draw_type: "free",
        p_business_date: "2026-07-25",
        p_daily_limit: dailyLimit,
        p_selected_province_id: TEST_PROVINCE_ID,
        p_selected_warlord_id: TEST_WARLORD_COMMON_ID,
        p_conquered_provinces_count_at_draw: 0,
        p_request_id: crypto.randomUUID(),
      });
      if (error) throw error;
    }

    // 同日でさらに引こうとすると上限に達している。
    const { error: limitError } = await client.rpc("execute_gacha_draw", {
      p_user_id: userId,
      p_draw_type: "free",
      p_business_date: "2026-07-25",
      p_daily_limit: dailyLimit,
      p_selected_province_id: TEST_PROVINCE_ID,
      p_selected_warlord_id: TEST_WARLORD_COMMON_ID,
      p_conquered_provinces_count_at_draw: 0,
      p_request_id: crypto.randomUUID(),
    });
    expect(limitError).not.toBeNull();
    expect(limitError?.message).toContain("gacha_daily_limit_exceeded");

    // 翌日のbusiness_dateでは新しい枠として引ける(前日分を持ち越さない)。
    const { data: nextDayDraw, error: nextDayError } = await client.rpc("execute_gacha_draw", {
      p_user_id: userId,
      p_draw_type: "free",
      p_business_date: "2026-07-26",
      p_daily_limit: dailyLimit,
      p_selected_province_id: TEST_PROVINCE_ID,
      p_selected_warlord_id: TEST_WARLORD_COMMON_ID,
      p_conquered_provinces_count_at_draw: 0,
      p_request_id: crypto.randomUUID(),
    });
    if (nextDayError) throw nextDayError;
    expect((nextDayDraw as { remaining_draws_today: number }[])[0].remaining_draws_today).toBe(dailyLimit - 1);
  });

  it("新規カード判定: 初回はtrue・2回目はfalse、20並列ではtrueは1件だけでcountは20になる", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser();
    createdUserIds.push(userId);

    const { data: firstDraw, error: firstError } = await client.rpc("execute_gacha_draw", {
      p_user_id: userId,
      p_draw_type: "free",
      p_business_date: "2026-07-25",
      p_daily_limit: 9999,
      p_selected_province_id: TEST_PROVINCE_ID,
      p_selected_warlord_id: TEST_WARLORD_COMMON_ID,
      p_conquered_provinces_count_at_draw: 0,
      p_request_id: crypto.randomUUID(),
    });
    if (firstError) throw firstError;
    expect((firstDraw as { is_new_card: boolean }[])[0].is_new_card).toBe(true);

    const { data: secondDraw, error: secondError } = await client.rpc("execute_gacha_draw", {
      p_user_id: userId,
      p_draw_type: "free",
      p_business_date: "2026-07-25",
      p_daily_limit: 9999,
      p_selected_province_id: TEST_PROVINCE_ID,
      p_selected_warlord_id: TEST_WARLORD_COMMON_ID,
      p_conquered_provinces_count_at_draw: 0,
      p_request_id: crypto.randomUUID(),
    });
    if (secondError) throw secondError;
    expect((secondDraw as { is_new_card: boolean }[])[0].is_new_card).toBe(false);

    // 別ユーザーで20並列取得し、is_new_card=trueが1件だけ(xmax=0判定)・countが20になることを確認する。
    const otherUserId = await createTestUser();
    createdUserIds.push(otherUserId);
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        client.rpc("execute_gacha_draw", {
          p_user_id: otherUserId,
          p_draw_type: "free",
          p_business_date: "2026-07-25",
          p_daily_limit: 9999,
          p_selected_province_id: TEST_PROVINCE_ID,
          p_selected_warlord_id: TEST_WARLORD_COMMON_ID,
          p_conquered_provinces_count_at_draw: 0,
          p_request_id: crypto.randomUUID(),
        })
      )
    );
    for (const r of results) {
      if (r.error) throw r.error;
    }
    const newCardOutcomes = results.filter((r) => (r.data as { is_new_card: boolean }[])[0].is_new_card === true);
    expect(newCardOutcomes).toHaveLength(1);

    const { data: warlordRow, error: warlordRowError } = await client
      .from("user_warlords")
      .select("count")
      .eq("user_id", otherUserId)
      .eq("warlord_id", TEST_WARLORD_COMMON_ID)
      .single();
    if (warlordRowError) throw warlordRowError;
    expect(warlordRow.count).toBe(20);
  });
});
