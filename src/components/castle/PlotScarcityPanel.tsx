import { Card } from "@/components/ui/Card";
import type { PlotScarcitySummary } from "@/modules/castle/domain/plot-presentation";

// 販売状況のサマリ。「全体のうちどれだけ売れたか」を進捗バーで見せることで、
// 数字を読まなくても残りの少なさが伝わるようにする。
export function PlotScarcityPanel({ summary }: { summary: PlotScarcitySummary }) {
  if (summary.total === 0) return null;

  const isSoldOut = summary.availableCount === 0;

  return (
    <Card highlight={summary.isLowStock} className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-parchment-dim">販売中の区画</p>
          <p className="text-2xl font-bold text-gold-soft">
            {summary.availableCount}
            <span className="ml-1 text-sm font-normal text-parchment-dim">/ 全{summary.total}区画</span>
          </p>
        </div>
        {summary.minAvailablePriceYen !== null && (
          <div className="text-right">
            <p className="text-xs text-parchment-dim">最低価格</p>
            <p className="text-lg font-bold text-parchment">
              {summary.minAvailablePriceYen.toLocaleString()}
              <span className="text-xs font-normal text-parchment-dim">円〜</span>
            </p>
          </div>
        )}
      </div>

      <div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-ink">
          <div
            className="h-full rounded-full bg-gradient-to-r from-crimson to-gold transition-all"
            style={{ width: `${summary.soldPercent}%` }}
          />
        </div>
        <p className="mt-1 text-right text-[10px] text-parchment-dim">{summary.soldPercent}% 成約済み</p>
      </div>

      {isSoldOut ? (
        <p className="text-center text-xs font-semibold text-parchment-dim">現在ご紹介できる区画はありません</p>
      ) : (
        summary.isLowStock && (
          <p className="text-center text-xs font-bold text-gold-soft">
            🔥 残りわずか {summary.availableCount}区画
          </p>
        )
      )}
    </Card>
  );
}
