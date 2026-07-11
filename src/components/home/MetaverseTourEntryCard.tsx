import Link from "next/link";
import { Card } from "@/components/ui/Card";

// 城下町デジタル内覧への入口カード。表示・非表示や文言の管理画面からの
// 変更には対応していない(MVP範囲。将来的な拡張候補)。
export function MetaverseTourEntryCard() {
  return (
    <Link href="/metaverse-tour" className="block">
      <Card className="transition hover:border-gold/50 hover:bg-ink-raised">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏯</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-parchment">戦国城下町 デジタル内覧</p>
            <p className="mt-0.5 text-xs text-parchment-dim">建設予定の城下町や武家屋敷を、スマートフォンから見学できます。</p>
          </div>
          <span className="text-xs font-semibold text-gold-soft">内覧をはじめる →</span>
        </div>
      </Card>
    </Link>
  );
}
