import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CONTRIBUTION_CATEGORIES } from "@/lib/external-services";

// Ver2.2指示書8章。AI寺子屋・マーケット・イベント・武将登用を国家ステータス
// (教育/文化/商業/観光/軍事)と結びつけて説明する。実際のステータス計算は行わない。
export function NationContributionCategoryCard() {
  return (
    <Card>
      <p className="text-xs text-parchment-dim">活動と国家ステータス</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {CONTRIBUTION_CATEGORIES.map((category) => (
          <Link
            key={category.id}
            href={category.href}
            className="rounded-lg border border-gold/15 px-3 py-2.5 text-center transition hover:border-gold/40 hover:bg-ink-raised"
          >
            <p className="text-lg">{category.icon}</p>
            <p className="mt-1 text-xs font-semibold text-parchment">{category.title}</p>
            <p className="mt-0.5 text-[11px] text-parchment-dim">{category.description}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}
