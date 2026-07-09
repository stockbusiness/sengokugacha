import { Card } from "@/components/ui/Card";
import type { ContributionSummary } from "@/lib/user-activity";

export function ContributionCard({ summary }: { summary: ContributionSummary }) {
  return (
    <Card>
      <p className="text-xs text-parchment-dim">国家貢献ポイント</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="font-heading text-lg font-bold tabular-nums text-gold-soft">
            {summary.total.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-parchment-dim">総国家貢献</p>
        </div>
        <div>
          <p className="font-heading text-lg font-bold tabular-nums text-gold-soft">
            {summary.thisMonth.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-parchment-dim">今月</p>
        </div>
        <div>
          <p className="font-heading text-lg font-bold tabular-nums text-gold-soft">
            {summary.today.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-parchment-dim">今日</p>
        </div>
      </div>
    </Card>
  );
}
