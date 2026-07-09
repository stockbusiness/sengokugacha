import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { NATION_BUILDER_OFFER } from "@/lib/founding-member";

function formatYen(amount: number): string {
  return `${amount.toLocaleString()}円`;
}

// 建国メンバー募集の導線カード。決済は行わず、送客先へ誘導するのみ。
// href/external の組み合わせで2通りの使い方をする:
//  - ダッシュボード等からは常に有効な内部リンク(/nation-builder)へ(external=false)
//  - /nation-builder ページ自体からは、既存の外部送客リンク(external_links)の
//    実URLへ(external=true。未設定時は「準備中」)
// 創設メンバーには特別価格を表示する(指示書8章)。
export function NationBuilderOfferCard({
  isFoundingMember,
  href,
  external = true,
  ctaLabel = "詳しく見る →",
}: {
  isFoundingMember: boolean;
  href: string | null;
  external?: boolean;
  ctaLabel?: string;
}) {
  return (
    <Card>
      <p className="text-xs text-parchment-dim">{NATION_BUILDER_OFFER.title}</p>
      <p className="mt-1 text-sm text-parchment">{NATION_BUILDER_OFFER.description}</p>

      <div className="mt-3">
        {isFoundingMember ? (
          <>
            <p className="text-xs text-parchment-dim line-through">
              一般価格: {formatYen(NATION_BUILDER_OFFER.regularPrice)}
            </p>
            <p className="font-heading text-lg font-bold text-gold-soft">
              創設メンバー特別価格: {formatYen(NATION_BUILDER_OFFER.foundingMemberPrice)}
            </p>
          </>
        ) : (
          <p className="font-heading text-lg font-bold text-gold-soft">
            一般価格: {formatYen(NATION_BUILDER_OFFER.regularPrice)}
          </p>
        )}
      </div>

      {href ? (
        external ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block rounded-lg border border-gold/25 px-4 py-2.5 text-center text-sm font-semibold text-gold-soft transition hover:border-gold/50 hover:bg-ink-raised"
          >
            {ctaLabel}
          </a>
        ) : (
          <Link
            href={href}
            className="mt-3 block rounded-lg border border-gold/25 px-4 py-2.5 text-center text-sm font-semibold text-gold-soft transition hover:border-gold/50 hover:bg-ink-raised"
          >
            {ctaLabel}
          </Link>
        )
      ) : (
        <p className="mt-3 text-center text-xs text-parchment-dim/60">準備中</p>
      )}
    </Card>
  );
}
