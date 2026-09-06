import { describe, expect, it } from "vitest";
import {
  canConfirmPayout,
  describePayoutConfirmation,
  describePayoutResult,
  describePayoutTarget,
} from "./payout-confirmation";

const target = { displayName: "織田信長", lineCount: 3, totalAmountYen: 12345 };

describe("canConfirmPayout", () => {
  it("対象があれば確認へ進める", () => {
    expect(canConfirmPayout(target)).toBe(true);
  });

  it("対象0件では確認へ進ませない", () => {
    expect(canConfirmPayout({ ...target, lineCount: 0 })).toBe(false);
    expect(canConfirmPayout({ ...target, totalAmountYen: 0 })).toBe(false);
  });
});

describe("describePayoutConfirmation", () => {
  // C3 の欠落。件数が無いと「3件・12,345円」と「30件・12,345円」を区別できない。
  it("件数を必ず含む", () => {
    expect(describePayoutConfirmation(target)).toContain("3件");
  });

  it("金額を桁区切りで含む", () => {
    expect(describePayoutConfirmation(target)).toContain("12,345円");
  });

  it("受取者名を含む", () => {
    expect(describePayoutConfirmation(target)).toContain("織田信長");
  });

  it("実際の振込を行わないことを明示する", () => {
    expect(describePayoutConfirmation(target)).toContain("実際の振込を行いません");
  });
});

describe("describePayoutTarget", () => {
  it("件数と金額を並べる", () => {
    expect(describePayoutTarget(target)).toBe("3件 / 12,345円");
  });
});

describe("describePayoutResult", () => {
  it("成功時は件数と金額を返す", () => {
    const message = describePayoutResult({
      outcome: "created",
      lineCount: 3,
      totalAmountYen: 12345,
      auditLogged: true,
    });
    expect(message).toContain("3件");
    expect(message).toContain("12,345円");
    expect(message).not.toContain("監査ログ");
  });

  // 監査ログが書けなくても支払記録は成功させる。止めると業務が止まる。
  // ただし失敗したことは運営が認識できるようにする。
  it("監査ログ失敗時は、支払は記録されたうえで失敗を伝える", () => {
    const message = describePayoutResult({
      outcome: "created",
      lineCount: 3,
      totalAmountYen: 12345,
      auditLogged: false,
    });
    expect(message).toContain("記録しました");
    expect(message).toContain("監査ログの記録に失敗");
  });

  // 同時実行の2件目がここに来る。1件目は成功しているので実務上は正しい結果。
  // 「失敗した」と読めない文言にする。
  it("対象0件時は、既に支払済みの可能性を示唆する", () => {
    const message = describePayoutResult({
      outcome: "no_target",
      lineCount: 0,
      totalAmountYen: 0,
      auditLogged: true,
    });
    expect(message).toContain("既に支払済み");
    expect(message).toContain("再読み込み");
  });

  it("受取者未指定時の文言", () => {
    expect(
      describePayoutResult({ outcome: "invalid_recipient", lineCount: 0, totalAmountYen: 0, auditLogged: true })
    ).toContain("受取者が指定されていません");
  });
});
