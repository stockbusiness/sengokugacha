// Passport実装指示書 PR-P1a「旧コミッション・支払機能の新規書込み停止」。
//
// 報酬計算・支払の正本はAgencyへ移った。Passport側は新規計上を止めるが、既存分の
// 清算(confirm/返金取消/支払)は従来どおり動かす(Q2回答 第1段階)。この判定と、
// 停止時に返すエラーコード・利用者向け文言をここ1箇所に集約する。
//
// 停止を解除・撤去するときに触る場所を1つにしておきたいので、呼び出し側には
// boolean ではなく判定結果ごと渡す。

export type CommissionWriteTarget =
  // 土地区画販売時の commission_ledger への新規計上。
  | "land_sale_commission"
  // 報酬ルールセットの作成・更新・削除・公開。
  | "commission_rule_set";

// 機械判定用のコード。呼び出し側のHTTP応答へそのまま載せる。
export const COMMISSION_WRITE_DISABLED_CODE = "commission_write_disabled";

export type CommissionWriteDecision =
  | { allowed: true }
  | { allowed: false; code: typeof COMMISSION_WRITE_DISABLED_CODE; message: string };

export type CommissionWriteSettings = {
  landSaleCommissionWriteEnabled: boolean;
  commissionRuleSetWriteEnabled: boolean;
};

// 設定行が無い場合の既定値。「停止」を既定にしてあるので、マイグレーションを適用した
// だけで停止が有効になる。設定行の投入忘れは書込みを開く方向へ働かない。
export const DEFAULT_COMMISSION_WRITE_SETTINGS: CommissionWriteSettings = {
  landSaleCommissionWriteEnabled: false,
  commissionRuleSetWriteEnabled: false,
};

const DISABLED_MESSAGE: Record<CommissionWriteTarget, string> = {
  land_sale_commission: "土地販売の報酬計上はAgencyへ移管済みです。新規計上は停止中です。",
  commission_rule_set: "報酬ルールの編集はAgencyへ移管済みです。新規計上は停止中です。",
};

function isEnabled(target: CommissionWriteTarget, settings: CommissionWriteSettings): boolean {
  switch (target) {
    case "land_sale_commission":
      return settings.landSaleCommissionWriteEnabled;
    case "commission_rule_set":
      return settings.commissionRuleSetWriteEnabled;
  }
}

export function decideCommissionWrite(
  target: CommissionWriteTarget,
  settings: CommissionWriteSettings
): CommissionWriteDecision {
  if (isEnabled(target, settings)) return { allowed: true };
  return { allowed: false, code: COMMISSION_WRITE_DISABLED_CODE, message: DISABLED_MESSAGE[target] };
}
