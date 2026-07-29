import Link from "next/link";
import { toDisplayUrl } from "@/lib/image-url";
import { getPlotStatusPresentation } from "@/modules/castle/domain/plot-presentation";
import { PlotStatusBadge } from "./PlotStatusBadge";

export type PlotCardData = {
  id: string;
  plot_code: string;
  name: string;
  price_yen: number;
  status: string;
  main_image_url: string | null;
};

// 区画の画像+価格の見せ方。ユーザー向け一覧(PlotCard)と代理店ポータルの
// 販売可能区画一覧の両方から使うため、カード本体とは分けている。
// 代理店側は紹介URL発行ボタンを持つ関係でLinkで包めないため、共通化はここまで。
export function PlotCardMedia({
  imageUrl,
  priceYen,
  status,
}: {
  imageUrl: string | null;
  priceYen: number;
  status?: string;
}) {
  return (
    <div className="relative aspect-[16/10] w-full bg-ink">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-4xl opacity-40">🏞️</div>
      )}
      {status && (
        <div className="absolute left-2 top-2">
          <PlotStatusBadge status={status} />
        </div>
      )}
      {/* 画像の下端を暗く落として価格の可読性を確保する */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8">
        <p className="text-lg font-bold text-gold-soft">{priceYen.toLocaleString()}円</p>
      </div>
    </div>
  );
}

// 区画一覧のカード。従来は文字だけの行だったが、区画画像を主役にして
// 「どんな土地か」が一覧の時点で伝わるようにする。
export function PlotCard({ plot, href }: { plot: PlotCardData; href: string }) {
  const { dimmed } = getPlotStatusPresentation(plot.status);

  return (
    <Link href={href} className="block">
      <div
        className={`overflow-hidden rounded-2xl border border-gold/15 bg-ink-raised/80 shadow-lg shadow-black/30 transition hover:border-gold/50 ${
          dimmed ? "opacity-55" : ""
        }`}
      >
        <PlotCardMedia imageUrl={toDisplayUrl(plot.main_image_url)} priceYen={plot.price_yen} status={plot.status} />
        <div className="px-3 py-2">
          <p className="truncate text-sm font-semibold text-parchment">{plot.name}</p>
          <p className="mt-0.5 text-xs text-parchment-dim">{plot.plot_code}</p>
        </div>
      </div>
    </Link>
  );
}
