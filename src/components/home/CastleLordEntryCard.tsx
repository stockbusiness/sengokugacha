import Link from "next/link";
import { Card } from "@/components/ui/Card";

// 城主プラン(全国お城プロジェクト)への入口カード。表示・非表示や文言の管理画面からの
// 変更には対応していない(MetaverseTourEntryCardと同じ方針)。
export function CastleLordEntryCard() {
  return (
    <Link href="/castles" className="block">
      <Card className="transition hover:border-gold/50 hover:bg-ink-raised">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏯</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-parchment">全国お城プロジェクト</p>
            <p className="mt-0.5 text-xs text-parchment-dim">城主が運営する城と、販売中の土地区画を見ることができます。</p>
          </div>
          <span className="text-xs font-semibold text-gold-soft">お城を見る →</span>
        </div>
      </Card>
    </Link>
  );
}
