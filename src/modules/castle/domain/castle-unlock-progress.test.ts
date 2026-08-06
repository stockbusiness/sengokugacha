import { describe, expect, it } from "vitest";
import { buildCastleUnlockedMessage, describeCastleUnlockProgress } from "./castle-unlock-progress";

const EMPTY = {
  provinceName: null,
  requiredWarlordCount: 0,
  ownedWarlordCount: 0,
  region: null,
  regionProvinceCount: 0,
  regionConqueredCount: 0,
};

describe("describeCastleUnlockProgress", () => {
  it("常時公開の城には進捗を出さない", () => {
    expect(describeCastleUnlockProgress("PUBLIC", EMPTY)).toBeNull();
  });

  it("非公開の城には進捗を出さない(いつか開くものではないため)", () => {
    expect(describeCastleUnlockProgress("UNPUBLISHED", EMPTY)).toBeNull();
  });

  it("国の制圧が条件なら、残りの必須武将数を出す", () => {
    const progress = describeCastleUnlockProgress("PROVINCE_CONQUEST_REQUIRED", {
      ...EMPTY,
      provinceName: "美濃",
      requiredWarlordCount: 5,
      ownedWarlordCount: 2,
    });
    expect(progress).toMatchObject({
      requirementLabel: "美濃の制圧",
      remaining: 3,
      unit: "warlord",
      label: "あと3武将で解放",
    });
    expect(progress?.ratio).toBeCloseTo(0.4);
  });

  it("地方の制覇が条件なら、残りの国数を出す", () => {
    const progress = describeCastleUnlockProgress("REGION_CONQUEST_REQUIRED", {
      ...EMPTY,
      region: "中部",
      regionProvinceCount: 9,
      regionConqueredCount: 7,
    });
    expect(progress).toMatchObject({
      requirementLabel: "中部地方の制覇",
      remaining: 2,
      unit: "province",
      label: "あと2国で解放",
    });
  });

  it("主要国が未設定なら進捗を出さない(解放条件を評価できないため)", () => {
    expect(
      describeCastleUnlockProgress("PROVINCE_CONQUEST_REQUIRED", { ...EMPTY, requiredWarlordCount: 5 })
    ).toBeNull();
  });

  it("必須武将が1人も設定されていない国では進捗を出さない", () => {
    expect(
      describeCastleUnlockProgress("PROVINCE_CONQUEST_REQUIRED", { ...EMPTY, provinceName: "美濃" })
    ).toBeNull();
  });

  it("地方の国数が取れなければ進捗を出さない", () => {
    expect(describeCastleUnlockProgress("REGION_CONQUEST_REQUIRED", { ...EMPTY, region: "中部" })).toBeNull();
  });

  // 条件を満たしているのに未解放として表示されるのは、解放判定のデータが
  // まだ反映されていない短い期間だけ。負の残数を出さないことを保証する。
  it("既に条件を満たしていても残数を負にしない", () => {
    const progress = describeCastleUnlockProgress("PROVINCE_CONQUEST_REQUIRED", {
      ...EMPTY,
      provinceName: "美濃",
      requiredWarlordCount: 3,
      ownedWarlordCount: 5,
    });
    expect(progress).toMatchObject({ remaining: 0, label: "まもなく解放", ratio: 1 });
  });
});

describe("buildCastleUnlockedMessage", () => {
  it("城名と解放条件を含む本文を作る", () => {
    expect(buildCastleUnlockedMessage("岐阜城", "美濃の制圧")).toBe(
      "【戦国パスポート】美濃の制圧により「岐阜城」が解放されました。アプリから城の詳細と販売中の区画をご覧いただけます。"
    );
  });
});
