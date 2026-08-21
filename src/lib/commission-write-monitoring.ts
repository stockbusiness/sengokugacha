import { COMMISSION_WRITE_BLOCKED_ACTION } from "@/lib/commission-write-settings";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Passport実装指示書 PR-P1b 追加条件4「停止中の対象件数を監視できるようにする」。
//
// 停止中に報酬計上が呼ばれること自体は異常ではない(土地が売れれば毎回通る)。監視したいのは
// 件数の推移で、想定より多ければ「止めたはずの経路がまだ動いている」「意図しない販売が
// 続いている」といった気付きになる。逆に土地販売が動いているのに0件なら、ガードを通らない
// 別経路が生まれている疑いになる。

export type CommissionWriteBlockedStats = {
  last24h: number;
  last7d: number;
  lastBlockedAt: string | null;
};

export async function getCommissionWriteBlockedStats(): Promise<CommissionWriteBlockedStats> {
  const supabase = createSupabaseServerClient();
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [last24h, last7d, latest] = await Promise.all([
    supabase
      .from("admin_audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", COMMISSION_WRITE_BLOCKED_ACTION)
      .gte("created_at", since24h),
    supabase
      .from("admin_audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", COMMISSION_WRITE_BLOCKED_ACTION)
      .gte("created_at", since7d),
    supabase
      .from("admin_audit_logs")
      .select("created_at")
      .eq("action", COMMISSION_WRITE_BLOCKED_ACTION)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (last24h.error) throw last24h.error;
  if (last7d.error) throw last7d.error;
  if (latest.error) throw latest.error;

  return {
    last24h: last24h.count ?? 0,
    last7d: last7d.count ?? 0,
    lastBlockedAt: latest.data?.created_at ?? null,
  };
}
