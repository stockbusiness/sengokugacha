import type { createSupabaseServerClient } from "@/lib/supabase-server";

// 千ノ国パスポート Stripe取得待ち期間対応指示書 §6.2(Reconciliation)。
// 実際の判定ロジックはPostgres関数reconciliation_snapshot()(20260811000002)に集約している。
// このファイルはその呼び出し・型付けのみを担う薄いラッパー。
//
// 方針: 検出・記録のみ。自動修正は一切行わない(§6.2「方針」)。異常を見つけても
// このコードは何も書き換えず、結果を返すだけ。修正操作は既存の管理画面から人が行う。

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

export type ReconciliationFinding = {
  category: "purchase" | "entitlement" | "integration";
  checkName: string;
  count: number;
  detail: string;
};

export async function runReconciliationChecks(supabase: SupabaseServerClient): Promise<ReconciliationFinding[]> {
  const { data, error } = await supabase.rpc("reconciliation_snapshot");
  if (error) throw new Error(error.message);

  return ((data ?? []) as { category: string; check_name: string; count: number; detail: string }[]).map((row) => ({
    category: row.category as ReconciliationFinding["category"],
    checkName: row.check_name,
    count: row.count,
    detail: row.detail,
  }));
}
