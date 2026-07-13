import { redirect } from "next/navigation";
import { getAgentSession } from "@/lib/agent-session";
import { getLineSettings } from "@/lib/line-settings";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function AgencyPortalPage() {
  const session = await getAgentSession();
  if (!session) redirect("/agency/login");

  const supabase = createSupabaseServerClient();

  const [{ data: agent }, { data: sales }, { data: children }, lineSettings] = await Promise.all([
    supabase.from("agents").select("*").eq("id", session.agentId).maybeSingle(),
    supabase.from("agent_sales").select("amount, payout_status, created_at").eq("agent_id", session.agentId),
    supabase.from("agents").select("id, name, rank, status").eq("parent_agent_id", session.agentId).order("name"),
    getLineSettings(),
  ]);

  if (!agent) redirect("/agency/login?error=agency_not_linked");

  const referralUrl = lineSettings?.liff_id
    ? `https://liff.line.me/${lineSettings.liff_id}?ref=${agent.referral_code}`
    : null;

  const totalAmount = (sales ?? []).reduce((sum, s) => sum + s.amount, 0);
  const unpaidAmount = (sales ?? []).filter((s) => s.payout_status === "unpaid").reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{agent.name} さん</h1>
          <p className="text-xs text-gold-soft">{agent.rank}</p>
        </div>
        <form action="/agency/logout" method="post">
          <button type="submit" className="text-xs text-parchment-dim hover:underline">
            ログアウト
          </button>
        </form>
      </div>

      <section className="rounded-xl border border-gold/20 bg-ink-raised p-4">
        <h2 className="text-sm font-semibold text-gold-soft">あなたの紹介URL</h2>
        {referralUrl ? (
          <p className="mt-2 break-all rounded-lg bg-black/30 p-3 text-xs text-parchment">{referralUrl}</p>
        ) : (
          <p className="mt-2 text-xs text-parchment-dim">LIFF IDが未設定のため、紹介URLを表示できません。運営にお問い合わせください。</p>
        )}
        <p className="mt-2 text-[11px] text-parchment-dim">このURL経由で新規登録した方が、あなたの紹介として記録されます。</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gold/20 bg-ink-raised p-4">
          <p className="text-[11px] text-parchment-dim">紹介実績(累計)</p>
          <p className="mt-1 text-lg font-bold">¥{totalAmount.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-gold/20 bg-ink-raised p-4">
          <p className="text-[11px] text-parchment-dim">未払い分</p>
          <p className="mt-1 text-lg font-bold">¥{unpaidAmount.toLocaleString()}</p>
        </div>
      </section>

      <a
        href="/agency/plots"
        className="block rounded-xl border border-gold/20 bg-ink-raised p-4 text-center text-sm font-semibold text-gold-soft hover:bg-gold/10"
      >
        全国の販売可能区画を見る・紹介URLを発行する →
      </a>

      {children && children.length > 0 && (
        <section className="rounded-xl border border-gold/20 bg-ink-raised p-4">
          <h2 className="text-sm font-semibold text-gold-soft">配下の代理店(参考表示)</h2>
          <ul className="mt-2 space-y-1">
            {children.map((c) => (
              <li key={c.id} className="flex justify-between text-xs text-parchment">
                <span>{c.name}</span>
                <span className="text-parchment-dim">
                  {c.rank}
                  {c.status === "inactive" ? "・停止中" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[11px] text-parchment-dim">
        金額・実績は簡易表示です。正式な報酬額・支払いはsengoku-ai.com側または運営との取り決めに従います。
      </p>
    </div>
  );
}
