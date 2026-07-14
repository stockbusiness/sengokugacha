import { describe, expect, it } from "vitest";
import { isCastleUnlocked } from "@/lib/castle-unlock";

describe("isCastleUnlocked", () => {
  it("PUBLICは常にtrue", () => {
    expect(
      isCastleUnlocked("PUBLIC", { hasPrimaryProvince: false, provinceConquered: false, regionConquered: false })
    ).toBe(true);
  });

  it("UNPUBLISHEDは常にfalse", () => {
    expect(
      isCastleUnlocked("UNPUBLISHED", { hasPrimaryProvince: true, provinceConquered: true, regionConquered: true })
    ).toBe(false);
  });

  it("PROVINCE_CONQUEST_REQUIREDは主要国制圧済みならtrue", () => {
    expect(
      isCastleUnlocked("PROVINCE_CONQUEST_REQUIRED", {
        hasPrimaryProvince: true,
        provinceConquered: true,
        regionConquered: false,
      })
    ).toBe(true);
  });

  it("PROVINCE_CONQUEST_REQUIREDは主要国未制圧ならfalse", () => {
    expect(
      isCastleUnlocked("PROVINCE_CONQUEST_REQUIRED", {
        hasPrimaryProvince: true,
        provinceConquered: false,
        regionConquered: false,
      })
    ).toBe(false);
  });

  it("PROVINCE_CONQUEST_REQUIREDでも主要国未設定ならtrue(誤ロック防止)", () => {
    expect(
      isCastleUnlocked("PROVINCE_CONQUEST_REQUIRED", {
        hasPrimaryProvince: false,
        provinceConquered: false,
        regionConquered: false,
      })
    ).toBe(true);
  });

  it("REGION_CONQUEST_REQUIREDは地方コンプ済みならtrue", () => {
    expect(
      isCastleUnlocked("REGION_CONQUEST_REQUIRED", {
        hasPrimaryProvince: true,
        provinceConquered: false,
        regionConquered: true,
      })
    ).toBe(true);
  });

  it("REGION_CONQUEST_REQUIREDは地方コンプ未達ならfalse", () => {
    expect(
      isCastleUnlocked("REGION_CONQUEST_REQUIRED", {
        hasPrimaryProvince: true,
        provinceConquered: true,
        regionConquered: false,
      })
    ).toBe(false);
  });

  it("REGION_CONQUEST_REQUIREDでも主要国未設定ならtrue(誤ロック防止)", () => {
    expect(
      isCastleUnlocked("REGION_CONQUEST_REQUIRED", {
        hasPrimaryProvince: false,
        provinceConquered: false,
        regionConquered: false,
      })
    ).toBe(true);
  });
});
