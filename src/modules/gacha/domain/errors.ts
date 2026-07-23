// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 2(§7)。src/lib/gacha.tsから移設。
export class GachaLimitExceededError extends Error {}
export class NoEligibleProvinceError extends Error {}
export class InsufficientTicketsError extends Error {}
