import { Card } from "@/components/ui/Card";
import type { PassportData } from "@/lib/passport";

export function NationalIdCard({ passport }: { passport: PassportData }) {
  return (
    <Card highlight ornate className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-gold/10 via-transparent to-transparent" />
      <div className="relative flex items-center justify-between">
        <p className="text-xs tracking-[0.2em] text-gold/70">国民証</p>
        <p className="font-heading text-xs tabular-nums text-parchment-dim">
          No.{String(passport.nationalNumber).padStart(6, "0")}
        </p>
      </div>

      <div className="relative mt-2 flex items-center justify-between border-b border-gold/15 pb-3">
        <div>
          <p className="font-heading text-lg font-bold text-parchment">
            {passport.displayName ?? "(未設定)"}
          </p>
          <p className="mt-0.5 text-xs text-parchment-dim">
            所属国: {passport.affiliatedProvinceName ?? "未所属"}
          </p>
        </div>
        <span className="rounded-full border border-gold/50 bg-gradient-to-b from-crimson-soft to-crimson-dark px-3 py-1.5 text-xs font-bold text-gold-soft shadow-[0_2px_10px_rgba(0,0,0,0.4)]">
          ✦ {passport.rank}
        </span>
      </div>

      <div className="relative mt-3 flex items-center justify-between">
        <p className="text-xs text-parchment-dim">国家貢献ポイント</p>
        <p className="text-base font-bold tabular-nums text-gold-soft">
          {passport.contributionPoints.toLocaleString()} pt
        </p>
      </div>

    </Card>
  );
}
