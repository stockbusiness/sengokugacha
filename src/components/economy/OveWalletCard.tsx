import { Card } from "@/components/ui/Card";
import type { ActivityLogEntry } from "@/lib/user-activity";

// Ver2.3指示書3章: OVEウォレット(モック)。実際のウォレット接続・送金は行わない。
// 保有予定OVEは国家貢献ポイントを1:1で仮換算した表示専用の値(将来、正式な換算レートに
// 差し替える前提)。
export function OveWalletCard({
  contributionPoints,
  entries,
}: {
  contributionPoints: number;
  entries: ActivityLogEntry[];
}) {
  return (
    <Card highlight>
      <p className="text-xs text-parchment-dim">OVEウォレット(準備中)</p>
      <p className="mt-1 font-heading text-2xl font-bold text-gold-soft">
        {contributionPoints.toLocaleString()} OVE(予定)
      </p>
      <p className="mt-1 text-[11px] text-parchment-dim">保有予定OVE。実際のウォレット接続は今後実装予定です。</p>

      {entries.length > 0 && (
        <div className="mt-3 border-t border-gold/15 pt-2">
          <p className="text-[11px] text-parchment-dim">獲得履歴</p>
          <ul className="mt-1 space-y-1">
            {entries.slice(0, 3).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between text-xs text-parchment-dim">
                <span>{entry.label}</span>
                <span className="text-gold-soft">+{entry.point} OVE(予定)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
