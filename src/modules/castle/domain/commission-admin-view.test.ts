import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE_TEXT,
  describeCommissionAdminNotice,
  type CommissionAdminScreen,
} from "./commission-admin-view";

const SCREENS: CommissionAdminScreen[] = ["rule_sets", "ledger", "payouts"];
const ALL_STOPPED = { landSaleCommissionWriteEnabled: false, commissionRuleSetWriteEnabled: false };
const ALL_OPEN = { landSaleCommissionWriteEnabled: true, commissionRuleSetWriteEnabled: true };

describe("describeCommissionAdminNotice", () => {
  it("停止中は報酬ルールが write_disabled、元帳と支払は settlement_only", () => {
    expect(describeCommissionAdminNotice("rule_sets", ALL_STOPPED).kind).toBe("write_disabled");
    expect(describeCommissionAdminNotice("ledger", ALL_STOPPED).kind).toBe("settlement_only");
    expect(describeCommissionAdminNotice("payouts", ALL_STOPPED).kind).toBe("settlement_only");
  });

  it("両方許可なら3画面とも通常運用", () => {
    for (const screen of SCREENS) {
      expect(describeCommissionAdminNotice(screen, ALL_OPEN)).toEqual({ kind: "none" });
    }
  });

  it("ルールセットだけ許可すると報酬ルール画面だけ通常運用に戻る", () => {
    const settings = { landSaleCommissionWriteEnabled: false, commissionRuleSetWriteEnabled: true };
    expect(describeCommissionAdminNotice("rule_sets", settings).kind).toBe("none");
    expect(describeCommissionAdminNotice("ledger", settings).kind).toBe("settlement_only");
    expect(describeCommissionAdminNotice("payouts", settings).kind).toBe("settlement_only");
  });

  it("土地報酬だけ許可すると元帳・支払だけ通常運用に戻る", () => {
    const settings = { landSaleCommissionWriteEnabled: true, commissionRuleSetWriteEnabled: false };
    expect(describeCommissionAdminNotice("rule_sets", settings).kind).toBe("write_disabled");
    expect(describeCommissionAdminNotice("ledger", settings).kind).toBe("none");
    expect(describeCommissionAdminNotice("payouts", settings).kind).toBe("none");
  });

  // 指示書が求める文言。表記ゆれで意味が薄れないよう固定する。
  it("見出しに「Agencyへ移管済み」と「新規計上停止中」が両方入る", () => {
    for (const screen of SCREENS) {
      const notice = describeCommissionAdminNotice(screen, ALL_STOPPED);
      if (notice.kind === "none") throw new Error("停止中はnoneにならない");
      expect(notice.title).toContain("Agencyへ移管済み");
      expect(notice.title).toContain("新規計上停止中");
    }
  });

  it("移管先・新規発生しないこと・確認先を本文に含める", () => {
    for (const screen of SCREENS) {
      const notice = describeCommissionAdminNotice(screen, ALL_STOPPED);
      if (notice.kind === "none") throw new Error("停止中はnoneにならない");
      const body = notice.lines.join("");
      expect(body).toContain("代理店システム");
      expect(body).toContain("お問い合わせ");
    }
  });

  // 二重支払の防止は文言でも明示する(PR-P1b 追加条件2)。
  it("元帳・支払には移管後報酬を取り込まない旨を書く", () => {
    for (const screen of ["ledger", "payouts"] as const) {
      const notice = describeCommissionAdminNotice(screen, ALL_STOPPED);
      if (notice.kind !== "settlement_only") throw new Error("settlement_onlyのはず");
      expect(notice.lines.join("")).toContain("二重支払");
    }
  });

  it("報酬ルールは削除せず参照だけ残す旨を書く", () => {
    const notice = describeCommissionAdminNotice("rule_sets", ALL_STOPPED);
    if (notice.kind !== "write_disabled") throw new Error("write_disabledのはず");
    expect(notice.lines.join("")).toContain("参照のみ");
  });
});

describe("EMPTY_STATE_TEXT", () => {
  // 0件表示が「読み込み失敗」と読めてしまうと、障害調査の空振りを招く。
  it("3画面とも、エラーではないと明示する", () => {
    for (const screen of SCREENS) {
      expect(EMPTY_STATE_TEXT[screen]).toContain("エラーではありません");
    }
  });
});
