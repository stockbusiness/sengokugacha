import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getGachaRateTiers } from "@/lib/gacha-rate-tiers";

// 管理画面での編集を再デプロイなしで即反映させるため、静的生成せず都度DBを参照する。
export const dynamic = "force-dynamic";

export default async function RatesPage() {
  const tiers = (await getGachaRateTiers()).slice().sort((a, b) => a.tier_order - b.tier_order);

  const { rows } = tiers.reduce<{ prevMax: number; rows: Array<{ key: string; rangeLabel: string; rare: number; mid: number; common: number }> }>(
    (acc, tier) => {
      const rangeLabel =
        tier.max_conquered_count == null
          ? `${acc.prevMax + 1}国〜`
          : `${acc.prevMax + 1}〜${tier.max_conquered_count}国`;
      const commonRate = Math.max(0, 1 - tier.rare_rate - tier.mid_rate);
      return {
        prevMax: tier.max_conquered_count ?? acc.prevMax,
        rows: [...acc.rows, { key: tier.id, rangeLabel, rare: tier.rare_rate, mid: tier.mid_rate, common: commonRate }],
      };
    },
    { prevMax: -1, rows: [] }
  );

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <PageHeader
        title="ガチャ排出率"
        subtitle="制圧済み国数に応じて、抽選される武将のレアリティ確率が変動します。排出率は無料ガチャ・有料ガチャで完全に共通です。"
      />

      <div className="space-y-3">
        {rows.map((row) => (
          <Card key={row.key}>
            <p className="text-xs font-semibold text-gold-soft">制圧済み国数: {row.rangeLabel}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <dt className="text-xs text-parchment-dim">大名級(レア)</dt>
                <dd className="mt-1 font-bold text-parchment">{(row.rare * 100).toFixed(2)}%</dd>
              </div>
              <div>
                <dt className="text-xs text-parchment-dim">武将級(中間)</dt>
                <dd className="mt-1 font-bold text-parchment">{(row.mid * 100).toFixed(2)}%</dd>
              </div>
              <div>
                <dt className="text-xs text-parchment-dim">足軽級(コモン)</dt>
                <dd className="mt-1 font-bold text-parchment">{(row.common * 100).toFixed(2)}%</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>

      <div className="mt-6 text-center">
        <Link
          href="/gacha"
          className="text-sm text-parchment-dim underline decoration-gold/30 underline-offset-4 transition hover:text-gold-soft"
        >
          ガチャ画面に戻る
        </Link>
      </div>
    </div>
  );
}
