import { Card } from "@/components/ui/Card";
import type { ActivityLogEntry } from "@/lib/user-activity";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityTimelineCard({ entries }: { entries: ActivityLogEntry[] }) {
  return (
    <Card>
      <p className="text-xs text-parchment-dim">国家活動履歴</p>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-parchment-dim">まだ活動記録がありません。</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between text-sm">
              <span className="text-parchment">
                ・{entry.label}
                <span className="ml-2 text-xs text-parchment-dim">{formatDateTime(entry.createdAt)}</span>
              </span>
              <span className="font-semibold text-gold-soft">+{entry.point}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
