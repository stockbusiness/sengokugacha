import { redirect } from "next/navigation";
import { PlotCardMedia } from "@/components/castle/PlotCard";
import { getAgentSession } from "@/lib/agent-session";
import { getAvailablePlots } from "@/lib/castle-plots";
import { toDisplayUrl } from "@/lib/image-url";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ReferralLinkButton } from "./referral-link-button";

export const dynamic = "force-dynamic";

export default async function AgencySellablePlotsPage() {
  const session = await getAgentSession();
  if (!session) redirect("/agency/login");

  const plots = await getAvailablePlots();
  const castleIds = Array.from(new Set(plots.map((p) => p.castle_id)));
  const supabase = createSupabaseServerClient();
  const { data: castles } = castleIds.length
    ? await supabase.from("castles").select("id, name").in("id", castleIds)
    : { data: [] };
  const castleNameById = new Map((castles ?? []).map((c) => [c.id, c.name as string]));

  // 全国の区画が1本のリストに並ぶと目的の城を探しにくいため、城ごとにまとめる。
  // getAvailablePlotsはcreated_at降順で返すので、その順序で城の初出順に並べる。
  const plotsByCastleId = new Map<string, typeof plots>();
  for (const plot of plots) {
    const existing = plotsByCastleId.get(plot.castle_id);
    if (existing) {
      existing.push(plot);
    } else {
      plotsByCastleId.set(plot.castle_id, [plot]);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">全国の販売可能区画({plots.length}件)</h1>
        <p className="mt-1 text-xs text-parchment-dim">
          どの城の区画でも販売できます。区画ごとに紹介URL・QRコードを発行してください。
        </p>
      </div>

      {Array.from(plotsByCastleId).map(([castleId, castlePlots]) => (
        <div key={castleId} className="space-y-3">
          <h2 className="flex items-baseline gap-2 border-b border-gold/15 pb-1 text-sm font-semibold text-gold-soft">
            {castleNameById.get(castleId) ?? "城名未設定"}
            <span className="text-xs font-normal text-parchment-dim">{castlePlots.length}区画</span>
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            {castlePlots.map((plot) => (
              <div key={plot.id} className="overflow-hidden rounded-xl border border-gold/20 bg-ink-raised">
                {/* 顧客に見せながら商談できるよう、区画画像と価格を先に出す */}
                <PlotCardMedia imageUrl={toDisplayUrl(plot.main_image_url)} priceYen={plot.price_yen} />
                <div className="space-y-3 p-4">
                  <div>
                    <p className="text-sm font-semibold text-parchment">{plot.name}</p>
                    <p className="text-xs text-parchment-dim">{plot.plot_code}</p>
                  </div>
                  <ReferralLinkButton plotId={plot.id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {plots.length === 0 && <p className="text-sm text-parchment-dim">現在販売可能な区画はありません。</p>}

      <a href="/agency" className="block text-center text-xs text-parchment-dim hover:underline">
        ← ポータルトップに戻る
      </a>
    </div>
  );
}
