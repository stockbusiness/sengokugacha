import { pickTierRates, type GachaRateTier } from "@/modules/gacha/domain/rate-tiers";

// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 2(§7)。src/lib/gacha.tsから移設。
// 04_mvp_spec_v1.2.md 3.1: 制圧済み国数に応じた排出率ティア。
// 管理画面(/admin/gacha-rates)から編集可能なgacha_rate_tiersテーブルを参照する
// (ユーザー向け排出率開示ページ /rates も同じテーブルを参照するため、常に表示と実際の抽選が一致する)。
export function pickSlot(conqueredCount: number, tiers: GachaRateTier[]): "common" | "mid" | "rare" {
  const { rare, mid } = pickTierRates(tiers, conqueredCount);
  const r = Math.random();
  if (r < rare) return "rare";
  if (r < rare + mid) return "mid";
  return "common";
}
