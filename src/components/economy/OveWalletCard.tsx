import { Card } from "@/components/ui/Card";
import type { ActivityLogEntry } from "@/lib/user-activity";

// カード収集型「国取り」× 城主経済圏 連携実装指示書v1.0 2-2・4-1章対応。
// 名称・注意書きは今後変更される可能性があるため、この1箇所に集約している
// (呼び出し元やDBには「OVE」という語を焼き込まない)。
const OVE_LABEL = "OVE移行予定ポイント";
const OVE_UNIT_SUFFIX = "pt";
const OVE_CAUTION =
  "このポイントは現在、暗号資産ウォレットの残高ではありません。外部送金・換金はできません。将来のOVEへの移行条件・換算率は未確定です。";

// OVEウォレット(モック)。実際のウォレット接続・送金は行わない。
// 保有予定ポイントは国家貢献ポイントを1:1で仮換算した表示専用の値(将来、正式な換算レートに
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
      <p className="text-xs text-parchment-dim">{OVE_LABEL}(準備中)</p>
      <p className="mt-1 font-heading text-2xl font-bold text-gold-soft">
        {contributionPoints.toLocaleString()} {OVE_UNIT_SUFFIX}
      </p>
      <p className="mt-1 text-[11px] text-parchment-dim">{OVE_CAUTION}</p>

      {entries.length > 0 && (
        <div className="mt-3 border-t border-gold/15 pt-2">
          <p className="text-[11px] text-parchment-dim">獲得履歴</p>
          <ul className="mt-1 space-y-1">
            {entries.slice(0, 3).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between text-xs text-parchment-dim">
                <span>{entry.label}</span>
                <span className="text-gold-soft">
                  +{entry.point} {OVE_UNIT_SUFFIX}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
