// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 2(§7)。src/lib/conquest-rules.tsから移設。
// 純粋関数: 必須武将を全部揃えているかの判定(rule_type='all_specified'のみ対応)。
// requiredWarlordIdsが空の場合は「条件未設定」とみなし、常にfalseを返す
// (国制覇条件0件で誤って即制覇扱いにしないためのガード)。
export function isConquestSatisfied(requiredWarlordIds: string[], ownedWarlordIds: string[]): boolean {
  if (requiredWarlordIds.length === 0) return false;
  const owned = new Set(ownedWarlordIds);
  return requiredWarlordIds.every((id) => owned.has(id));
}
