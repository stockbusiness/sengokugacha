import { describe, expect, it } from "vitest";
import {
  COMMISSION_WRITE_DISABLED_CODE,
  COMMISSION_WRITE_REOPEN_ALLOWED,
  DEFAULT_COMMISSION_WRITE_SETTINGS,
  decideCommissionWrite,
  resolveEffectiveCommissionWriteSettings,
} from "./commission-write-policy";

const BOTH_ENABLED = { landSaleCommissionWriteEnabled: true, commissionRuleSetWriteEnabled: true };
const BOTH_DISABLED = { landSaleCommissionWriteEnabled: false, commissionRuleSetWriteEnabled: false };

describe("decideCommissionWrite", () => {
  it("両方停止なら土地報酬もルールセットも不許可", () => {
    for (const target of ["land_sale_commission", "commission_rule_set"] as const) {
      const decision = decideCommissionWrite(target, BOTH_DISABLED);
      expect(decision.allowed).toBe(false);
      expect(decision.allowed === false && decision.code).toBe(COMMISSION_WRITE_DISABLED_CODE);
    }
  });

  it("両方許可なら従来どおり両方通す", () => {
    expect(decideCommissionWrite("land_sale_commission", BOTH_ENABLED)).toEqual({ allowed: true });
    expect(decideCommissionWrite("commission_rule_set", BOTH_ENABLED)).toEqual({ allowed: true });
  });

  // フラグを2つに分けている意味(片方だけ開けられること)を担保する。
  it("土地報酬だけ許可してもルールセットは開かない", () => {
    const settings = { landSaleCommissionWriteEnabled: true, commissionRuleSetWriteEnabled: false };
    expect(decideCommissionWrite("land_sale_commission", settings).allowed).toBe(true);
    expect(decideCommissionWrite("commission_rule_set", settings).allowed).toBe(false);
  });

  it("ルールセットだけ許可しても土地報酬は開かない", () => {
    const settings = { landSaleCommissionWriteEnabled: false, commissionRuleSetWriteEnabled: true };
    expect(decideCommissionWrite("commission_rule_set", settings).allowed).toBe(true);
    expect(decideCommissionWrite("land_sale_commission", settings).allowed).toBe(false);
  });

  it("停止理由は対象ごとに書き分ける", () => {
    const land = decideCommissionWrite("land_sale_commission", BOTH_DISABLED);
    const ruleSet = decideCommissionWrite("commission_rule_set", BOTH_DISABLED);
    expect(land.allowed === false && land.message).toContain("土地販売");
    expect(ruleSet.allowed === false && ruleSet.message).toContain("報酬ルール");
    // 管理者が次に何を見ればよいか分かるよう、移管先を明示する。
    expect(land.allowed === false && land.message).toContain("Agency");
    expect(ruleSet.allowed === false && ruleSet.message).toContain("Agency");
  });
});

describe("resolveEffectiveCommissionWriteSettings", () => {
  // PR-P1b 追加条件4。DBだけで再開できてしまうと、DBを直接触れる者の操作ミス1つで
  // 報酬計上が復活する。コード側のゲートと両方揃わないと開かない。
  it("コード側のゲートが閉じている限り、DBがtrueでも停止のまま", () => {
    expect(resolveEffectiveCommissionWriteSettings(BOTH_ENABLED, false)).toEqual(BOTH_DISABLED);
  });

  it("コード側のゲートを開けて初めてDBの値が効く", () => {
    expect(resolveEffectiveCommissionWriteSettings(BOTH_ENABLED, true)).toEqual(BOTH_ENABLED);
    // ゲートを開けてもDBが停止側なら停止のまま(2つ揃って初めて開く)。
    expect(resolveEffectiveCommissionWriteSettings(BOTH_DISABLED, true)).toEqual(BOTH_DISABLED);
  });

  // 現在の出荷状態。ここがtrueで入ることは、再開を明示的に承認したときだけ。
  it("既定ではコード側のゲートが閉じている", () => {
    expect(COMMISSION_WRITE_REOPEN_ALLOWED).toBe(false);
    expect(resolveEffectiveCommissionWriteSettings(BOTH_ENABLED)).toEqual(BOTH_DISABLED);
  });
});

describe("DEFAULT_COMMISSION_WRITE_SETTINGS", () => {
  // 設定行の投入忘れが「意図せず書込みが開く」方向へ働かないことを固定する。
  it("設定行が無いときは両方停止", () => {
    expect(DEFAULT_COMMISSION_WRITE_SETTINGS).toEqual(BOTH_DISABLED);
    expect(decideCommissionWrite("land_sale_commission", DEFAULT_COMMISSION_WRITE_SETTINGS).allowed).toBe(false);
    expect(decideCommissionWrite("commission_rule_set", DEFAULT_COMMISSION_WRITE_SETTINGS).allowed).toBe(false);
  });
});
