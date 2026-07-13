import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { CommissionRateSet } from "@/lib/castle-commission-engine";

export type CommissionRuleSet = CommissionRateSet & {
  id: string;
  name: string;
  status: "draft" | "published";
  effective_from: string | null;
  effective_to: string | null;
};

// 8.4「公開後のルールは編集せず、新バージョンを作成する」。現在有効な公開済みルールセットを
// (effective_fromが最新のもの)取得する。取引時点の適用ルールはcommission_ledgerに
// スナップショットとして保存されるため、後からここが変わっても過去の報酬計算には影響しない。
export async function getCurrentPublishedRuleSet(): Promise<CommissionRuleSet | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("commission_rule_sets")
    .select("*")
    .eq("status", "published")
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function getRuleSets(): Promise<CommissionRuleSet[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("commission_rule_sets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
