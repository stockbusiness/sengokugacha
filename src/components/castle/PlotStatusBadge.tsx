import { getPlotStatusPresentation, type PlotStatusTone } from "@/modules/castle/domain/plot-presentation";

// 状態ごとの色分け。販売中だけを金色で目立たせ、販売済み・取消は沈める
// (一覧で「まだ買えるもの」に視線が行くようにするため)。
const TONE_CLASS: Record<PlotStatusTone, string> = {
  available: "bg-gold/20 text-gold-soft ring-1 ring-gold/40",
  pending: "bg-crimson/25 text-parchment ring-1 ring-crimson/40",
  sold: "bg-ink text-parchment-dim ring-1 ring-parchment-dim/20",
  inactive: "bg-ink text-parchment-dim ring-1 ring-parchment-dim/20",
};

export function PlotStatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const { label, tone } = getPlotStatusPresentation(status);
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE_CLASS[tone]} ${className}`}
    >
      {label}
    </span>
  );
}
