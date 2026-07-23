// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 2(§7)。src/lib/gacha.tsから移設。

export type ProvinceRow = {
  id: string;
  region: string;
  is_final_province: boolean;
  unlock_condition_count: number | null;
};

// 開始/終了どちらかが未指定なら、その境界は「制限なし」として扱う
// (03_gacha_game_design 15章: 「適用期間の開始・終了日時を指定可能(未指定なら手動で戻すまで持続)」)。
export function isEventWindowActive(startAt: string | null, endAt: string | null): boolean {
  const now = new Date();
  if (startAt && now < new Date(startAt)) return false;
  if (endAt && now > new Date(endAt)) return false;
  return true;
}

// 制圧済み国数が美濃国の解放しきい値を今回の抽選で初めて超えたかどうか。
export function didJustUnlockMino(previousCount: number, newCount: number, allProvinces: ProvinceRow[]): boolean {
  const mino = allProvinces.find((p) => p.is_final_province);
  if (!mino || mino.unlock_condition_count == null) return false;
  return previousCount < mino.unlock_condition_count && newCount >= mino.unlock_condition_count;
}
