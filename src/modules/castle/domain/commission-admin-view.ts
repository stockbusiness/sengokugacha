// Passport実装指示書 PR-P1b「停止中は管理画面を履歴参照専用にし、
// 『Agencyへ移管済み／新規計上停止中』を表示する」。
//
// 停止対象(報酬ルール)と継続対象(既存分の清算)が混在しているため、画面ごとに扱いを
// 変える。全部を一律で参照専用にすると、継続すべき清算業務まで止まって見える。
// 3画面で表記が食い違わないよう、文言もここに集約する。

import type { CommissionWriteSettings } from "./commission-write-policy";

export type CommissionAdminScreen = "rule_sets" | "ledger" | "payouts";

export type CommissionAdminNotice =
  // 書込み停止。操作UIを出さない(参照のみ)。
  | { kind: "write_disabled"; title: string; lines: string[] }
  // 既存分の清算のみ可能。操作UIは残す。
  | { kind: "settlement_only"; title: string; lines: string[] }
  // 通常運用。何も出さない。
  | { kind: "none" };

const TITLE = "Agencyへ移管済み — 新規計上停止中";

// 「データがありません」だけで終わらせず、障害や読み込み失敗ではないことが分かる
// 表現にする(PR-P1b 追加条件1)。
const RULE_SETS_LINES = [
  "報酬の計算・支払は代理店システム(Agency)へ移管しました。正本は代理店システムが持ちます。",
  "この画面では新規の報酬ルールを作成・編集・公開できません。新しい報酬も発生しません。",
  "過去のルールは監査・調査のため削除せず、参照のみ残しています。清算対象の有無を確認したい場合は本部管理者へお問い合わせください。",
];

const SETTLEMENT_LINES = [
  "報酬の計算・支払は代理店システム(Agency)へ移管しました。移管後に発生した報酬は代理店システムで管理されます。",
  "この画面で扱えるのは、移管前に計上済みの報酬の清算(確定・取消・支払記録)だけです。新しい報酬は計上されません。",
  "二重支払を防ぐため、移管後の報酬をこの元帳へ取り込むことはありません。清算対象の有無を確認したい場合は本部管理者へお問い合わせください。",
];

function isWriteEnabledFor(screen: CommissionAdminScreen, settings: CommissionWriteSettings): boolean {
  switch (screen) {
    case "rule_sets":
      return settings.commissionRuleSetWriteEnabled;
    case "ledger":
    case "payouts":
      return settings.landSaleCommissionWriteEnabled;
  }
}

export function describeCommissionAdminNotice(
  screen: CommissionAdminScreen,
  settings: CommissionWriteSettings
): CommissionAdminNotice {
  if (isWriteEnabledFor(screen, settings)) return { kind: "none" };

  if (screen === "rule_sets") {
    return { kind: "write_disabled", title: TITLE, lines: RULE_SETS_LINES };
  }
  return { kind: "settlement_only", title: TITLE, lines: SETTLEMENT_LINES };
}

// 空の一覧に出す文言。「読み込み失敗」と区別が付くようにする(PR-P1b 追加条件1・
// 必須テスト「API障害時の表示と対象0件の表示が区別される」)。
export const EMPTY_STATE_TEXT: Record<CommissionAdminScreen, string> = {
  rule_sets: "登録されている報酬ルールはありません(エラーではありません)。移管前に作成されたルールがあればここに表示されます。",
  ledger: "清算対象の報酬はありません(エラーではありません)。移管前に計上された報酬があればここに表示されます。",
  payouts: "支払待ちの報酬はありません(エラーではありません)。移管前に確定した未払いの報酬があればここに表示されます。",
};
