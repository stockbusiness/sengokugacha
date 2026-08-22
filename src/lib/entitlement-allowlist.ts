import { createSupabaseServerClient } from "@/lib/supabase-server";

// Passport実装指示書 PR-P2a。承認済み送信元の参照。
//
// 判定の正本はSQL関数 entitlement_balance_column() 側にある(付与・取消の両方が
// トランザクション内でそれを呼ぶ)。ここは運用画面や調査で「いま何が許可されて
// いるか」を読むための参照口。
//
// 書き込む関数は意図的に用意しない。登録は責任者の承認を経た運用DB操作に限る。
// 画面から追加できるようにすると、誤操作ひとつで外部システムの権利が
// ローカル残高へ入り始めてしまう。

export type EntitlementSourceAllowlistEntry = {
  sourceSystemKey: string;
  note: string | null;
  approvedBy: string | null;
  createdAt: string;
};

export async function listEntitlementSourceAllowlist(): Promise<EntitlementSourceAllowlistEntry[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("entitlement_source_allowlist")
    .select("source_system_key, note, approved_by, created_at")
    .order("created_at");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    sourceSystemKey: row.source_system_key,
    note: row.note,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
  }));
}

export async function listAllowedSourceSystemKeys(): Promise<string[]> {
  return (await listEntitlementSourceAllowlist()).map((entry) => entry.sourceSystemKey);
}
