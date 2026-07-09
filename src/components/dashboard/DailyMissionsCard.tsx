import { Card } from "@/components/ui/Card";
import type { DailyMissionStatus } from "@/lib/daily-missions";

// 本日の任務。Ver2.0初期では表示と簡易達成状態のみで、報酬付与などは行わない。
export function DailyMissionsCard({ missions }: { missions: DailyMissionStatus[] }) {
  return (
    <Card>
      <p className="text-xs text-parchment-dim">本日の任務</p>
      <ul className="mt-2 space-y-1.5">
        {missions.map((mission) => (
          <li key={mission.key} className="flex items-center gap-2 text-sm">
            <span
              className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[11px] ${
                mission.completed
                  ? "border-gold/60 bg-gold/20 text-gold-soft"
                  : "border-parchment-dim/30 text-transparent"
              }`}
            >
              ✓
            </span>
            <span className={mission.completed ? "text-parchment-dim line-through" : "text-parchment"}>
              {mission.title}
            </span>
            {mission.rewardPoint > 0 && (
              <span className="text-[11px] text-gold/70">+{mission.rewardPoint}pt</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
