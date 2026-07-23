// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 3(§8、passport read model)。
// src/lib/passport.tsから移設。
// 国家建設率(Ver2.0初期の簡易計算)。国盗り進捗・図鑑進捗・ログイン継続・本日の任務達成の
// 加重平均。将来、国家建設の実データが揃った時点で本格的な計算に差し替える前提のダミー寄りの値。
export function calcNationBuildingRate(params: {
  conqueredProvinceCount: number;
  totalProvinceCount: number;
  warlordCount: number;
  totalWarlordCount: number;
  loginStreak: number;
  completedMissionCount: number;
  totalMissionCount: number;
}): number {
  const provinceRatio =
    params.totalProvinceCount > 0 ? params.conqueredProvinceCount / params.totalProvinceCount : 0;
  const warlordRatio = params.totalWarlordCount > 0 ? params.warlordCount / params.totalWarlordCount : 0;
  const streakRatio = Math.min(params.loginStreak, 30) / 30;
  const missionRatio =
    params.totalMissionCount > 0 ? params.completedMissionCount / params.totalMissionCount : 0;

  const rate = provinceRatio * 0.4 + warlordRatio * 0.3 + streakRatio * 0.15 + missionRatio * 0.15;
  return Math.round(rate * 100);
}
