import { Card } from "@/components/ui/Card";
import { NATION_BUILDER_OFFER } from "@/lib/founding-member";

function formatYen(amount: number): string {
  return `${amount.toLocaleString()}円`;
}

// 建国メンバー募集の導線カード。決済は行わず、既存の外部送客リンク(external_links)の
// URLへ送客するのみ。創設メンバーには特別価格を表示する(指示書8章)。
export function NationBuilderOfferCard({
  isFoundingMember,
  detailUrl,
}: {
  isFoundingMember: boolean;
  detailUrl: string | null;
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

      {detailUrl ? (
        <a
          href={detailUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block rounded-lg border border-gold/25 px-4 py-2.5 text-center text-sm font-semibold text-gold-soft transition hover:border-gold/50 hover:bg-ink-raised"
        >
          詳しく見る →
        </a>
      ) : (
        <p className="mt-3 text-center text-xs text-parchment-dim/60">準備中</p>
      )}
    </Card>
  );
}
