import { describe, expect, it } from "vitest";
import {
  PASSPORT_PRODUCT_CODES,
  expectedEntitlementTypeFor,
  isPassportOwnedProduct,
  isProductCodeProvided,
} from "./product-ownership";

describe("isProductCodeProvided", () => {
  it("実質的な値があれば true", () => {
    expect(isProductCodeProvided("SPPT_KOKUDAKA")).toBe(true);
    // 前後空白つきでも「送ってはいる」。所有かどうかは別の判定で落ちる。
    expect(isProductCodeProvided(" SPPT_KOKUDAKA ")).toBe(true);
  });

  it("null・undefined・空文字・空白のみは false", () => {
    for (const value of [null, undefined, "", "   ", "\t", "\n"]) {
      expect(isProductCodeProvided(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("expectedEntitlementTypeFor", () => {
  it("担当商品は対応する種別を返す", () => {
    expect(expectedEntitlementTypeFor("SPPT_KOKUDAKA")).toBe("kokudaka");
    expect(expectedEntitlementTypeFor("SPPT_GACHA_TICKET")).toBe("gacha_ticket");
    expect(expectedEntitlementTypeFor("SPPT_LAND_PLOT")).toBe("land_plot");
  });

  it("未知のコードは null", () => {
    expect(expectedEntitlementTypeFor("UNKNOWN")).toBeNull();
    expect(expectedEntitlementTypeFor("KOKU-100")).toBeNull();
  });

  // Q5 のご判断。purchases.item_type には実在するが、商品所有者マップには入れない。
  it("tenka_pass / castle_lord_plan は担当外", () => {
    expect(expectedEntitlementTypeFor("tenka_pass")).toBeNull();
    expect(expectedEntitlementTypeFor("castle_lord_plan")).toBeNull();
    expect(expectedEntitlementTypeFor("SPPT_TENKA_PASS")).toBeNull();
    expect(expectedEntitlementTypeFor("SPPT_CASTLE_LORD_PLAN")).toBeNull();
  });

  // ご指定の形式要件。救済しない。
  it("前後空白を trim して救済しない", () => {
    expect(expectedEntitlementTypeFor(" SPPT_KOKUDAKA")).toBeNull();
    expect(expectedEntitlementTypeFor("SPPT_KOKUDAKA ")).toBeNull();
  });

  it("大文字小文字を自動変換しない", () => {
    expect(expectedEntitlementTypeFor("sppt_kokudaka")).toBeNull();
    expect(expectedEntitlementTypeFor("Sppt_Kokudaka")).toBeNull();
  });

  // Object のプロトタイプ由来のキーを所有と誤判定しないこと。
  it("プロトタイプのプロパティ名を所有と誤判定しない", () => {
    for (const key of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(expectedEntitlementTypeFor(key), key).toBeNull();
    }
  });

  it("担当商品は3つだけ", () => {
    expect(Object.keys(PASSPORT_PRODUCT_CODES)).toEqual([
      "SPPT_KOKUDAKA",
      "SPPT_GACHA_TICKET",
      "SPPT_LAND_PLOT",
    ]);
  });
});

describe("isPassportOwnedProduct", () => {
  it("担当商品だけ true", () => {
    expect(isPassportOwnedProduct("SPPT_LAND_PLOT")).toBe(true);
    expect(isPassportOwnedProduct("SPPT_UNKNOWN")).toBe(false);
  });
});
