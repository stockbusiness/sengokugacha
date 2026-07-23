// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 2(§7)。src/lib/gacha.tsから移設。
// Ver2.0: 武将登用(ガチャ)結果に応じた国家貢献ポイント。指示書8章の「登用結果に応じて
// 国家貢献ポイントを表示」に対応。ポイント配分は簡易な固定値で、経済ロジックの厳密さは
// 今回のスコープ外(将来調整しやすいよう、この関数にのみ定義を置く)。
const CONTRIBUTION_POINTS_BY_SLOT: Record<string, number> = { common: 5, mid: 15, rare: 40 };
const CONTRIBUTION_POINTS_NEW_CARD_BONUS = 10;

export function calcContributionPoints(slotType: string, isNewCard: boolean): number {
  return (CONTRIBUTION_POINTS_BY_SLOT[slotType] ?? 0) + (isNewCard ? CONTRIBUTION_POINTS_NEW_CARD_BONUS : 0);
}
