import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { developmentPlotStatusLabel } from "@/lib/founding-member";
import type { PassportData } from "@/lib/passport";

// 既存の土地オーナー向け。旧「土地」を「国家開発区画」として表示するカード。
// Ver2.1では実際のメタバース座標変換は行わず、区画ID等の表示のみ。
export function DevelopmentPlotCard({ passport }: { passport: PassportData }) {
  if (!passport.isFoundingMember) return null;

  return (
    <Card>
      <p className="text-xs text-parchment-dim">国家開発区画</p>
      <p className="font-heading mt-1 text-lg font-bold text-gold-soft">
        {passport.developmentPlotId ?? "未割り当て"}
      </p>

      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-xs text-parchment-dim">所属エリア</dt>
          <dd className="text-parchment">{passport.developmentArea ?? "未設定"}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-xs text-parchment-dim">開発ステータス</dt>
          <dd className="text-parchment">{developmentPlotStatusLabel(passport.developmentPlotStatus)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-xs text-parchment-dim">優先権ステータス</dt>
          <dd className="text-gold-soft">メタバース実装時 優先反映対象</dd>
        </div>
      </dl>

      <Link
        href="/founding-member"
        className="mt-3 block text-center text-sm text-parchment-dim underline decoration-gold/30 underline-offset-4 transition hover:text-gold-soft"
      >
        詳しく見る →
      </Link>
    </Card>
  );
}
