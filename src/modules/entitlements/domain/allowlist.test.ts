import { describe, expect, it } from "vitest";
import {
  APPLICABLE_ENTITLEMENT_TYPES,
  FORBIDDEN_ENTITLEMENT_TYPES,
  FORBIDDEN_SOURCE_SYSTEM_KEYS,
  decideEntitlementApplication,
  describeDecision,
  isApplicableEntitlementType,
  resolveBalanceColumn,
  resolveBalanceColumnForType,
  wasBalanceApplied,
} from "./allowlist";

const ALLOWED = ["sengoku-game"];
const EMPTY: string[] = [];

// 判定を読みやすくするための薄いラッパ。
const decide = (source: string, productCode: string | null | undefined, type: string, allowed = ALLOWED) =>
  decideEntitlementApplication(source, productCode, type, allowed);

describe("decideEntitlementApplication: 正常系", () => {
  it("許可された送信元 + SPPT_KOKUDAKA + kokudaka は適用", () => {
    expect(decide("sengoku-game", "SPPT_KOKUDAKA", "kokudaka")).toBe("APPLIED");
  });

  it("許可された送信元 + SPPT_GACHA_TICKET + gacha_ticket は適用", () => {
    expect(decide("sengoku-game", "SPPT_GACHA_TICKET", "gacha_ticket")).toBe("APPLIED");
  });
});

describe("decideEntitlementApplication: 1. 送信元", () => {
  it("許可されていない送信元は、正しい商品コードでも適用しない", () => {
    expect(decide("unknown-system", "SPPT_KOKUDAKA", "kokudaka")).toBe("SOURCE_NOT_ALLOWED");
  });

  // 出荷時の状態。allowlist が空なら何も適用されない。
  it("allowlist が空なら、どの組み合わせでも適用しない", () => {
    expect(decide("sengoku-game", "SPPT_KOKUDAKA", "kokudaka", EMPTY)).toBe("SOURCE_NOT_ALLOWED");
  });

  // 順序に意味がある。権限の無い相手へ商品の話をする必要はない。
  it("送信元が不許可なら、商品コードを見る前に SOURCE_NOT_ALLOWED", () => {
    expect(decide("sennokuni-nft-market", null, "generic")).toBe("SOURCE_NOT_ALLOWED");
    expect(decide("sennokuni-nft-market", "UNKNOWN", "kokudaka")).toBe("SOURCE_NOT_ALLOWED");
  });
});

describe("decideEntitlementApplication: 2. 商品コードの有無", () => {
  it("product_code が null なら PRODUCT_CODE_REQUIRED", () => {
    expect(decide("sengoku-game", null, "kokudaka")).toBe("PRODUCT_CODE_REQUIRED");
  });

  it("product_code が undefined なら PRODUCT_CODE_REQUIRED", () => {
    expect(decide("sengoku-game", undefined, "kokudaka")).toBe("PRODUCT_CODE_REQUIRED");
  });

  it("product_code が空文字なら PRODUCT_CODE_REQUIRED", () => {
    expect(decide("sengoku-game", "", "kokudaka")).toBe("PRODUCT_CODE_REQUIRED");
  });

  it("product_code が空白のみなら PRODUCT_CODE_REQUIRED", () => {
    expect(decide("sengoku-game", "   ", "kokudaka")).toBe("PRODUCT_CODE_REQUIRED");
  });
});

describe("decideEntitlementApplication: 3. 商品の所有", () => {
  it("未知のコードは PRODUCT_NOT_OWNED", () => {
    expect(decide("sengoku-game", "KOKU-100", "kokudaka")).toBe("PRODUCT_NOT_OWNED");
  });

  // Q5 のご判断。purchases.item_type には実在するが担当商品には入れない。
  it("tenka_pass / castle_lord_plan は PRODUCT_NOT_OWNED", () => {
    expect(decide("sengoku-game", "tenka_pass", "kokudaka")).toBe("PRODUCT_NOT_OWNED");
    expect(decide("sengoku-game", "castle_lord_plan", "kokudaka")).toBe("PRODUCT_NOT_OWNED");
  });

  // 形式要件。trim も大文字変換もして救済しない。
  it("前後空白つきのコードは PRODUCT_NOT_OWNED（PRODUCT_CODE_REQUIRED ではない）", () => {
    expect(decide("sengoku-game", " SPPT_KOKUDAKA ", "kokudaka")).toBe("PRODUCT_NOT_OWNED");
  });

  it("小文字のコードは PRODUCT_NOT_OWNED", () => {
    expect(decide("sengoku-game", "sppt_kokudaka", "kokudaka")).toBe("PRODUCT_NOT_OWNED");
  });
});

describe("decideEntitlementApplication: 4. 商品と種別の一致", () => {
  // 商品コードが正しくても、対応しない種別を送れば適用しない。
  it("SPPT_KOKUDAKA + gacha_ticket は PRODUCT_TYPE_MISMATCH", () => {
    expect(decide("sengoku-game", "SPPT_KOKUDAKA", "gacha_ticket")).toBe("PRODUCT_TYPE_MISMATCH");
  });

  it("SPPT_GACHA_TICKET + kokudaka は PRODUCT_TYPE_MISMATCH", () => {
    expect(decide("sengoku-game", "SPPT_GACHA_TICKET", "kokudaka")).toBe("PRODUCT_TYPE_MISMATCH");
  });

  it("担当商品 + generic は PRODUCT_TYPE_MISMATCH", () => {
    expect(decide("sengoku-game", "SPPT_KOKUDAKA", "generic")).toBe("PRODUCT_TYPE_MISMATCH");
  });
});

describe("decideEntitlementApplication: 5. 残高適用対象の種別", () => {
  // 商品としては担当だが、残高種別ではない。二段の結果になる。
  it("SPPT_LAND_PLOT + land_plot は TYPE_NOT_APPLICABLE", () => {
    expect(decide("sengoku-game", "SPPT_LAND_PLOT", "land_plot")).toBe("TYPE_NOT_APPLICABLE");
  });
});

describe("禁止対象", () => {
  it("禁止された送信元は、正しい商品コードでも適用しない", () => {
    for (const forbidden of FORBIDDEN_SOURCE_SYSTEM_KEYS) {
      expect(decide(forbidden, "SPPT_KOKUDAKA", "kokudaka"), forbidden).toBe("SOURCE_NOT_ALLOWED");
      expect(ALLOWED).not.toContain(forbidden);
    }
  });

  it("禁止された種別が適用対象に含まれていない", () => {
    for (const forbidden of FORBIDDEN_ENTITLEMENT_TYPES) {
      expect(isApplicableEntitlementType(forbidden), forbidden).toBe(false);
    }
  });

  it("適用対象の種別は kokudaka と gacha_ticket の2つだけ", () => {
    expect(APPLICABLE_ENTITLEMENT_TYPES).toEqual(["kokudaka", "gacha_ticket"]);
  });
});

describe("resolveBalanceColumn", () => {
  it("適用時は残高列を返す", () => {
    expect(resolveBalanceColumn("sengoku-game", "SPPT_KOKUDAKA", "kokudaka", ALLOWED)).toBe("kokudaka");
    expect(resolveBalanceColumn("sengoku-game", "SPPT_GACHA_TICKET", "gacha_ticket", ALLOWED)).toBe("gacha_tickets");
  });

  it("適用対象でなければ null", () => {
    expect(resolveBalanceColumn("sengoku-game", null, "kokudaka", ALLOWED)).toBeNull();
    expect(resolveBalanceColumn("sengoku-game", "UNKNOWN", "kokudaka", ALLOWED)).toBeNull();
    expect(resolveBalanceColumn("sengoku-game", "SPPT_KOKUDAKA", "gacha_ticket", ALLOWED)).toBeNull();
    expect(resolveBalanceColumn("sengoku-game", "SPPT_LAND_PLOT", "land_plot", ALLOWED)).toBeNull();
    expect(resolveBalanceColumn("unknown-system", "SPPT_KOKUDAKA", "kokudaka", ALLOWED)).toBeNull();
    expect(resolveBalanceColumn("sengoku-game", "SPPT_KOKUDAKA", "kokudaka", EMPTY)).toBeNull();
  });
});

describe("wasBalanceApplied", () => {
  it("付与時に適用した行だけ、取消で残高を戻す", () => {
    expect(wasBalanceApplied("APPLIED")).toBe(true);
  });

  it("付与が拒否された行は、取消でも残高を戻さない", () => {
    for (const decision of [
      "SOURCE_NOT_ALLOWED",
      "PRODUCT_CODE_REQUIRED",
      "PRODUCT_NOT_OWNED",
      "PRODUCT_TYPE_MISMATCH",
      "TYPE_NOT_APPLICABLE",
      "USER_UNRESOLVED",
      "DISMISSED",
    ]) {
      expect(wasBalanceApplied(decision), decision).toBe(false);
    }
  });

  // 本規則の導入前に適用済みの行。当時の規則で実際に加算されているため戻す。
  it("application_decision を持たない旧行は戻す", () => {
    expect(wasBalanceApplied(null)).toBe(true);
  });

  // ここが一番危ないところ。allowlist も商品マップも運用で変わるため、取消の時点で
  // 再評価すると「入れていない残高を引く」ことになる。
  it("取消の判断に allowlist を使わない（後から承認しても、入れていない残高は引かない）", () => {
    const grantedWhileNotAllowed = decide("later-approved", "SPPT_KOKUDAKA", "kokudaka", []);
    expect(grantedWhileNotAllowed).toBe("SOURCE_NOT_ALLOWED");
    expect(decide("later-approved", "SPPT_KOKUDAKA", "kokudaka", ["later-approved"])).toBe("APPLIED");
    expect(wasBalanceApplied(grantedWhileNotAllowed)).toBe(false);
  });

  // 同じことが商品マップにも言える。担当商品を後から増やしても、過去の行は戻さない。
  it("取消の判断に商品マップを使わない", () => {
    const grantedWithUnownedProduct = decide("sengoku-game", "FUTURE_PRODUCT", "kokudaka");
    expect(grantedWithUnownedProduct).toBe("PRODUCT_NOT_OWNED");
    expect(wasBalanceApplied(grantedWithUnownedProduct)).toBe(false);
  });
});

describe("resolveBalanceColumnForType", () => {
  // 取消側が使う。送信元も商品コードも見ない。
  it("種別だけで残高列を返す", () => {
    expect(resolveBalanceColumnForType("kokudaka")).toBe("kokudaka");
    expect(resolveBalanceColumnForType("gacha_ticket")).toBe("gacha_tickets");
    expect(resolveBalanceColumnForType("land_plot")).toBeNull();
    expect(resolveBalanceColumnForType("generic")).toBeNull();
  });
});

describe("describeDecision", () => {
  const context = {
    sourceSystemKey: "unknown-system",
    productCode: "KOKU-100",
    entitlementType: "generic",
    commonUserId: "cu-1",
  };

  it("適用時は理由を出さない", () => {
    expect(describeDecision("APPLIED", context)).toBeNull();
  });

  // 「なぜ残高が動かなかったのか」を後から追えるようにする。
  it("非適用時は、何が原因かが分かる文言を返す", () => {
    expect(describeDecision("SOURCE_NOT_ALLOWED", context)).toContain("unknown-system");
    expect(describeDecision("SOURCE_NOT_ALLOWED", context)).toContain("allowlist");
    expect(describeDecision("PRODUCT_CODE_REQUIRED", context)).toContain("product_code");
    expect(describeDecision("PRODUCT_NOT_OWNED", context)).toContain("KOKU-100");
    expect(describeDecision("PRODUCT_TYPE_MISMATCH", context)).toContain("KOKU-100");
    expect(describeDecision("PRODUCT_TYPE_MISMATCH", context)).toContain("generic");
    expect(describeDecision("TYPE_NOT_APPLICABLE", context)).toContain("generic");
    expect(describeDecision("USER_UNRESOLVED", context)).toContain("cu-1");
    expect(describeDecision("DISMISSED", context)).toContain("却下");
  });

  it("すべての判定結果に文言がある（APPLIED を除く）", () => {
    const decisions = [
      "SOURCE_NOT_ALLOWED",
      "PRODUCT_CODE_REQUIRED",
      "PRODUCT_NOT_OWNED",
      "PRODUCT_TYPE_MISMATCH",
      "TYPE_NOT_APPLICABLE",
      "USER_UNRESOLVED",
      "DISMISSED",
    ] as const;
    for (const decision of decisions) {
      expect(describeDecision(decision, context), decision).toBeTruthy();
    }
  });
});
