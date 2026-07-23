// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 2(§7)。src/lib/regions.tsから移設。

// 03_gacha_game_design_v1.4.md 13章「地方コンプ特典」の称号。
// クーポン発行・ガチャ排出率アップイベント・NFT市場先行アクセス等の追加特典は
// 対応する基盤(クーポン/イベント管理)が無いため未実装。石高ボーナスのみ自動付与する。
export const REGION_TITLES: Record<string, string> = {
  東北: "奥州の雄",
  関東: "関八州の主",
  中部: "中部の覇者",
  近畿: "畿内の実力者",
  中国: "中国の統率者",
  四国: "四国の平定者",
  九州: "九州の覇王",
  北陸: "加賀の名将",
};

// achievements.achievement_type の命名(例: "region_complete_kanto")に使うスラグ。
export const REGION_SLUGS: Record<string, string> = {
  東北: "tohoku",
  関東: "kanto",
  中部: "chubu",
  近畿: "kinki",
  中国: "chugoku",
  四国: "shikoku",
  九州: "kyushu",
  北陸: "hokuriku",
};

export function regionCompleteAchievementType(region: string): string {
  return `region_complete_${REGION_SLUGS[region] ?? region}`;
}

const KOKUDAKA_BONUS_PER_PROVINCE = 100;

export function getRegionKokudakaBonus(provinceCount: number): number {
  return provinceCount * KOKUDAKA_BONUS_PER_PROVINCE;
}
