import { Card } from "@/components/ui/Card";

// 国家建設率。Ver2.0初期では国盗り・図鑑・連続ログイン・本日の任務達成から算出した
// 簡易値(lib/passport.ts の calcNationBuildingRate)を表示するのみ。
export function NationBuildingRateCard({ rate }: { rate: number }) {
  const clamped = Math.min(100, Math.max(0, rate));

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-parchment-dim">国家建設率</p>
        <p className="font-heading text-2xl font-bold tabular-nums text-gold-soft">{clamped}%</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold/70 to-gold"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </Card>
  );
}
