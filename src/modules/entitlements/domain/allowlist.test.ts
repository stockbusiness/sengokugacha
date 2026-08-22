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

describe("decideEntitlementApplication", () => {
  it("許可された送信元 + kokudaka は適用", () => {
    expect(decideEntitlementApplication("sengoku-game", "kokudaka", ALLOWED)).toBe("APPLIED");
  });

  it("許可された送信元 + gacha_ticket は適用", () => {
    expect(decideEntitlementApplication("sengoku-game", "gacha_ticket", ALLOWED)).toBe("APPLIED");
  });

  // Q6回答 案d の要。種別だけ合っていても通さない。
  it("許可されていない送信元は、kokudaka でも適用しない", () => {
    expect(decideEntitlementApplication("unknown-system", "kokudaka", ALLOWED)).toBe("SOURCE_NOT_ALLOWED");
  });

  it("許可された送信元でも generic は適用しない", () => {
    expect(decideEntitlementApplication("sengoku-game", "generic", ALLOWED)).toBe("TYPE_NOT_APPLICABLE");
  });

  it("未知の種別は適用しない", () => {
    for (const type of ["nft_artwork", "serial", "membership", "councilor", ""]) {
      expect(decideEntitlementApplication("sengoku-game", type, ALLOWED), type).toBe("TYPE_NOT_APPLICABLE");
    }
  });

  // 出荷時の状態。allowlist が空なら何も適用されない。
  it("allowlist が空なら、どの組み合わせでも適用しない", () => {
    for (const type of [...APPLICABLE_ENTITLEMENT_TYPES, "generic", "nft_artwork"]) {
      expect(decideEntitlementApplication("sengoku-game", type, EMPTY), type).toBe("SOURCE_NOT_ALLOWED");
    }
  });

  // 送信元の判定を先に行う。権限の無い相手へ「種別が対象外」と返す必要はない。
  it("送信元が不許可なら、種別を見る前に SOURCE_NOT_ALLOWED", () => {
    expect(decideEntitlementApplication("sennokuni-nft-market", "generic", ALLOWED)).toBe("SOURCE_NOT_ALLOWED");
  });
});

describe("禁止対象", () => {
  // Q6のご指示。allowlistへ誤って足すとここで落ちる。
  it("禁止された送信元が許可リストに混ざっていない", () => {
    for (const forbidden of FORBIDDEN_SOURCE_SYSTEM_KEYS) {
      expect(decideEntitlementApplication(forbidden, "kokudaka", ALLOWED), forbidden).toBe("SOURCE_NOT_ALLOWED");
      // 仮に運用が誤って登録しても、種別で止まるわけではない点に注意。
      // 登録してはいけないことをテストで明示する。
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
  it("種別に対応する残高列を返す", () => {
    expect(resolveBalanceColumn("sengoku-game", "kokudaka", ALLOWED)).toBe("kokudaka");
    expect(resolveBalanceColumn("sengoku-game", "gacha_ticket", ALLOWED)).toBe("gacha_tickets");
  });

  it("適用対象でなければ null", () => {
    expect(resolveBalanceColumn("sengoku-game", "generic", ALLOWED)).toBeNull();
    expect(resolveBalanceColumn("unknown-system", "kokudaka", ALLOWED)).toBeNull();
    expect(resolveBalanceColumn("sengoku-game", "kokudaka", EMPTY)).toBeNull();
  });
});

describe("wasBalanceApplied", () => {
  it("付与時に適用した行だけ、取消で残高を戻す", () => {
    expect(wasBalanceApplied("APPLIED")).toBe(true);
  });

  it("付与が拒否された行は、取消でも残高を戻さない", () => {
    for (const decision of ["SOURCE_NOT_ALLOWED", "TYPE_NOT_APPLICABLE", "USER_UNRESOLVED", "DISMISSED"]) {
      expect(wasBalanceApplied(decision), decision).toBe(false);
    }
  });

  // 本規則の導入前に適用済みの行。当時の規則で実際に加算されているため戻す。
  it("application_decision を持たない旧行は戻す", () => {
    expect(wasBalanceApplied(null)).toBe(true);
  });

  // これが本PRで一番危ないところ。allowlist は運用で変わるため、取消の時点で
  // 再評価すると「入れていない残高を引く」ことになる。
  it("取消の判断に allowlist を使わない(後から承認しても、入れていない残高は引かない)", () => {
    const grantedWhileNotAllowed = decideEntitlementApplication("later-approved", "kokudaka", []);
    expect(grantedWhileNotAllowed).toBe("SOURCE_NOT_ALLOWED");

    // 運用が後から送信元を承認した。
    const nowAllowed = ["later-approved"];
    expect(decideEntitlementApplication("later-approved", "kokudaka", nowAllowed)).toBe("APPLIED");

    // それでも、この行の残高は戻さない。
    expect(wasBalanceApplied(grantedWhileNotAllowed)).toBe(false);
  });
});

describe("resolveBalanceColumnForType", () => {
  // 取消側が使う。送信元を見ない。
  it("送信元に関係なく、種別だけで残高列を返す", () => {
    expect(resolveBalanceColumnForType("kokudaka")).toBe("kokudaka");
    expect(resolveBalanceColumnForType("gacha_ticket")).toBe("gacha_tickets");
    expect(resolveBalanceColumnForType("generic")).toBeNull();
    expect(resolveBalanceColumnForType("nft_artwork")).toBeNull();
  });
});

describe("describeDecision", () => {
  const context = { sourceSystemKey: "unknown-system", entitlementType: "generic", commonUserId: "cu-1" };

  it("適用時は理由を出さない", () => {
    expect(describeDecision("APPLIED", context)).toBeNull();
  });

  // 「なぜ残高が動かなかったのか」を後から追えるようにする。
  it("非適用時は、何が原因かが分かる文言を返す", () => {
    expect(describeDecision("SOURCE_NOT_ALLOWED", context)).toContain("unknown-system");
    expect(describeDecision("SOURCE_NOT_ALLOWED", context)).toContain("allowlist");
    expect(describeDecision("TYPE_NOT_APPLICABLE", context)).toContain("generic");
    expect(describeDecision("USER_UNRESOLVED", context)).toContain("cu-1");
    expect(describeDecision("DISMISSED", context)).toContain("却下");
  });
});
