import { redirect } from "next/navigation";
import { getAgentSession } from "@/lib/agent-session";
import { getAvailablePlots } from "@/lib/castle-plots";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">全国の販売可能区画({plots.length}件)</h1>
        <p className="mt-1 text-xs text-parchment-dim">
          どの城の区画でも販売できます。区画ごとに紹介URL・QRコードを発行してください。
        </p>
      </div>

      <div className="space-y-3">
        {plots.map((plot) => (
          <div key={plot.id} className="rounded-xl border border-gold/20 bg-ink-raised p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-parchment">{plot.name}</p>
                <p className="text-xs text-parchment-dim">
                  {castleNameById.get(plot.castle_id) ?? ""} / {plot.plot_code}
                </p>
              </div>
              <p className="text-sm font-bold text-gold-soft">{plot.price_yen.toLocaleString()}円</p>
            </div>
            <div className="mt-3">
              <ReferralLinkButton plotId={plot.id} />
            </div>
          </div>
        ))}
        {plots.length === 0 && <p className="text-sm text-parchment-dim">現在販売可能な区画はありません。</p>}
      </div>

      <a href="/agency" className="block text-center text-xs text-parchment-dim hover:underline">
        ← ポータルトップに戻る
      </a>
    </div>
  );
}
