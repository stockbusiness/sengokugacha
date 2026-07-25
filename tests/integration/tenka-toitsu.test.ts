import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, getTestSupabaseClient, hasIntegrationTestDatabase } from "./support/env";

// 千ノ国パスポート PR #147マージ前最終修正指示§5(ガチャ残テスト)。
//
// tests/integration/gacha-draw-rollback-and-conquest.test.ts は、execute_gacha_draw()の
// 国制覇ロジックそのものを検証する目的で意図的にsupabase/seed.sqlの合成テスト国
// (is_final_province=false)のみを使い、「美濃国・天下統一は実データ(60国)を要するため
// このファイルのスコープ外」と明記していた。美濃国解放の「しきい値をまたいだ瞬間」の
// 判定ロジック自体(didJustUnlockMino)は src/modules/gacha/domain/draw-limit.test.ts で
// 純粋関数として既にカバーされている。
//
// このファイルはその2つの間を埋める。20260707000002_seed_initial_master_data.sqlが
// 投入する「実際の」美濃国(is_final_province=true, unlock_condition_count=60)と
// その3枠(美濃国の足軽/斎藤道三/織田信長)を使い、
//   (a) 美濃国未解放時に天下統一実績を記録できないこと
//   (b) 美濃国解放条件到達後、天下統一(代表武将選択・実績記録)ができること(冪等性・
//       未所持武将選択時のエラーを含む)
//   (c) 美濃国(最終国)そのものの制圧がexecute_gacha_draw()で正しく記録されること
// を実データで検証する。
//
// なお「province_conquered && chosenProvince.is_final_province」からtenkaToitsuTriggered
// を導出する1行のロジック(src/lib/gacha.ts performDraw)は、(c)で美濃国の制圧自体が
// 正しく記録されることを確認済みであれば、あとは論理積の自明な組み合わせであり、
// これ以上の分岐を持たないため、追加のテストは行わない(ユーザー確認済みの判断)。

describe.skipIf(!hasIntegrationTestDatabase())("美濃国制圧・天下統一(実データ)", () => {
  let minoProvinceId: string;
  let ashigaruId: string; // common
  let saitoDosanId: string; // mid
  let odaNobunagaId: string; // rare
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const client = getTestSupabaseClient();
    const { data: mino, error: minoError } = await client.from("provinces").select("id, unlock_condition_count").eq("name", "美濃").single();
    if (minoError) throw minoError;
    minoProvinceId = mino.id as string;
    expect(mino.unlock_condition_count).toBe(60);

    const { data: warlords, error: warlordsError } = await client
      .from("warlords")
      .select("id, slot_type")
      .eq("province_id", minoProvinceId);
    if (warlordsError) throw warlordsError;
    ashigaruId = (warlords as { id: string; slot_type: string }[]).find((w) => w.slot_type === "common")!.id;
    saitoDosanId = (warlords as { id: string; slot_type: string }[]).find((w) => w.slot_type === "mid")!.id;
    odaNobunagaId = (warlords as { id: string; slot_type: string }[]).find((w) => w.slot_type === "rare")!.id;
  });

  afterEach(async () => {
    const client = getTestSupabaseClient();
    for (const userId of createdUserIds.splice(0)) {
      await client.from("achievements").delete().eq("user_id", userId);
      await client.from("gacha_logs").delete().eq("user_id", userId);
      await client.from("gacha_daily_usage").delete().eq("user_id", userId);
      await client.from("user_warlords").delete().eq("user_id", userId);
      await client.from("user_provinces").delete().eq("user_id", userId).eq("province_id", minoProvinceId);
      await deleteTestUser(userId);
    }
  });

  it("美濃国未解放: 美濃国が未制圧のユーザーは天下統一実績を記録できない", async () => {
    const { completeTenkaToitsu, getTenkaToitsuStatus } = await import("@/lib/tenka-toitsu");
    const userId = await createTestUser();
    createdUserIds.push(userId);

    const status = await getTenkaToitsuStatus(userId);
    expect(status.minoConquered).toBe(false);
    expect(status.achieved).toBe(false);
    expect(status.ownedWarlords).toHaveLength(0);

    await expect(completeTenkaToitsu(userId, ashigaruId)).rejects.toThrow("美濃国がまだ制圧されていません");

    const { data: achievements, error } = await getTestSupabaseClient()
      .from("achievements")
      .select("id")
      .eq("user_id", userId)
      .eq("achievement_type", "tenka_toitsu");
    if (error) throw error;
    expect(achievements).toHaveLength(0);
  });

  it("最終国制圧: execute_gacha_draw()で美濃国(3枠)を全て取得すると美濃国が制圧される", async () => {
    const client = getTestSupabaseClient();
    const userId = await createTestUser();
    createdUserIds.push(userId);

    // 解放条件(60国制圧)は既に満たされている前提で、美濃国を直接指定して抽選する
    // (execute_gacha_draw自体は選択国の解放条件を再検証しない設計。TS層の
    // getEligibleProvincesが解放条件でフィルタする責務を持つため、DB関数単体の
    // 検証としてはp_conquered_provinces_count_at_drawを充足値で直接渡す)。
    for (const warlordId of [ashigaruId, saitoDosanId]) {
      const { data, error } = await client.rpc("execute_gacha_draw", {
        p_user_id: userId,
        p_draw_type: "free",
        p_business_date: "2026-07-25",
        p_daily_limit: 9999,
        p_selected_province_id: minoProvinceId,
        p_selected_warlord_id: warlordId,
        p_conquered_provinces_count_at_draw: 60,
        p_request_id: crypto.randomUUID(),
      });
      if (error) throw error;
      expect((data as { province_conquered: boolean }[])[0].province_conquered).toBe(false);
    }

    const { data: finalDraw, error: finalError } = await client.rpc("execute_gacha_draw", {
      p_user_id: userId,
      p_draw_type: "free",
      p_business_date: "2026-07-25",
      p_daily_limit: 9999,
      p_selected_province_id: minoProvinceId,
      p_selected_warlord_id: odaNobunagaId,
      p_conquered_provinces_count_at_draw: 60,
      p_request_id: crypto.randomUUID(),
    });
    if (finalError) throw finalError;
    expect((finalDraw as { province_conquered: boolean }[])[0].province_conquered).toBe(true);

    const { data: province, error: provinceError } = await client
      .from("user_provinces")
      .select("is_conquered")
      .eq("user_id", userId)
      .eq("province_id", minoProvinceId)
      .single();
    if (provinceError) throw provinceError;
    expect(province.is_conquered).toBe(true);
  });

  it("天下統一: 美濃国制圧後は所持武将を選んで実績を記録でき、再実行しても冪等・未所持武将はエラーになる", async () => {
    const { completeTenkaToitsu, getTenkaToitsuStatus, WarlordNotOwnedError } = await import("@/lib/tenka-toitsu");
    const client = getTestSupabaseClient();
    const userId = await createTestUser();
    createdUserIds.push(userId);

    // 美濃国制圧自体は前のテストで実データにより検証済みのため、ここではuser_provincesを
    // 直接「制圧済み」にして天下統一フロー(代表武将選択・実績記録)のみを切り出して検証する。
    const { error: conquerError } = await client
      .from("user_provinces")
      .upsert({ user_id: userId, province_id: minoProvinceId, is_conquered: true }, { onConflict: "user_id,province_id" });
    if (conquerError) throw conquerError;

    // 織田信長のみ所持している状態にする。
    const { error: warlordError } = await client.from("user_warlords").insert({ user_id: userId, warlord_id: odaNobunagaId, count: 1 });
    if (warlordError) throw warlordError;

    const statusBeforeSelection = await getTenkaToitsuStatus(userId);
    expect(statusBeforeSelection.minoConquered).toBe(true);
    expect(statusBeforeSelection.achieved).toBe(false);
    expect(statusBeforeSelection.ownedWarlords.map((w) => w.id)).toEqual([odaNobunagaId]);

    // 所持していない武将(斎藤道三)を選ぶとエラーになる。
    await expect(completeTenkaToitsu(userId, saitoDosanId)).rejects.toThrow(WarlordNotOwnedError);

    // 所持している武将(織田信長)を選ぶと実績が記録される。
    await completeTenkaToitsu(userId, odaNobunagaId);

    const statusAfter = await getTenkaToitsuStatus(userId);
    expect(statusAfter.achieved).toBe(true);
    expect(statusAfter.selectedWarlordName).toBe("織田信長");

    // 再度呼び出しても実績は重複記録されない(冪等)。
    await completeTenkaToitsu(userId, odaNobunagaId);
    const { data: achievements, error: achievementsError } = await client
      .from("achievements")
      .select("id")
      .eq("user_id", userId)
      .eq("achievement_type", "tenka_toitsu");
    if (achievementsError) throw achievementsError;
    expect(achievements).toHaveLength(1);
  });
});
