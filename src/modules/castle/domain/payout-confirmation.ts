// Passport実装指示書 PR-P1d「支払済み操作の排他と件数表示」。
//
// 確認ダイアログと結果表示の文言を組み立てる。C3 の確認で「対象件数が出ていない」
// ことが分かったため、件数を必ず含める。
//
// 「3件・12,345円」と「30件・12,345円」は運用上まったく違う意味を持つ。件数が無いと、
// 確定漏れや二重確定に気づく機会が失われる。

export type PayoutTarget = {
  displayName: string;
  lineCount: number;
  totalAmountYen: number;
};

const yen = (amount: number) => `${amount.toLocaleString("ja-JP")}円`;

// 支払ボタンを押せるか。対象0件では確認へ進ませない。
export function canConfirmPayout(target: PayoutTarget): boolean {
  return target.lineCount > 0 && target.totalAmountYen > 0;
}

// 確認ダイアログの文言。件数・金額・実振込ではないことを必ず示す。
export function describePayoutConfirmation(target: PayoutTarget): string {
  return [
    `${target.displayName}さんへの支払を記録します。`,
    ``,
    `対象件数: ${target.lineCount}件`,
    `合計金額: ${yen(target.totalAmountYen)}`,
    ``,
    `このボタンは実際の振込を行いません。銀行振込等で実際に支払った後、記録として実行してください。`,
  ].join("\n");
}

// 一覧に出す1行分の要約。
export function describePayoutTarget(target: PayoutTarget): string {
  return `${target.lineCount}件 / ${yen(target.totalAmountYen)}`;
}

export type PayoutResult = {
  outcome: "created" | "no_target" | "invalid_recipient";
  lineCount: number;
  totalAmountYen: number;
  // 監査ログの記録に失敗しても支払記録自体は成功させる。止めると業務が止まるため。
  // ただし失敗したことは運営が認識できるようにする。
  auditLogged: boolean;
};

export function describePayoutResult(result: PayoutResult): string {
  if (result.outcome === "invalid_recipient") {
    return "受取者が指定されていません。";
  }

  // 同時実行の2件目がここに来る。1件目は成功しているので、実務上は正しい結果。
  // 「失敗した」と読めない文言にする。
  if (result.outcome === "no_target") {
    return "対象の確定済み報酬がありませんでした。既に支払済みとして記録されている可能性があります。一覧を再読み込みしてご確認ください。";
  }

  const base = `${result.lineCount}件 / ${yen(result.totalAmountYen)} を支払済みとして記録しました。`;
  if (result.auditLogged) return base;

  return `${base}\nただし監査ログの記録に失敗しました。支払記録は残っていますが、操作履歴には残っていません。`;
}
