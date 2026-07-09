import { Card } from "@/components/ui/Card";
import type { Badge } from "@/lib/badges";

export function BadgeCard({ badges }: { badges: Badge[] }) {
  return (
    <Card>
      <p className="text-xs text-parchment-dim">バッジ</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {badges.map((badge) => (
          <div
            key={badge.id}
            title={badge.description}
            className={`rounded-lg border px-2 py-3 text-center ${
              badge.earned ? "border-gold/50 bg-ink" : "border-parchment-dim/15 opacity-40"
            }`}
          >
            <p className="text-xl">{badge.icon}</p>
            <p className="mt-1 text-[11px] font-semibold text-parchment">{badge.label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
