import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Passport実装指示書 PR-P2b。「未知イベントは削除せず、受信記録と拒否理由を残す」
// というご指示は、読める手段が無ければ意味を持たない。
//
// 既存の /unresolved は user_id 未解決(application_status = 'not_applied')の行だけを
// 返すため、PRODUCT_NOT_OWNED 等は一覧に出てこない。あちらは application_status が
// 'applied'(=処理は完了した)になるため。
//
// ここは「処理は終わったが残高へは入れなかった」行を、理由つきで返す。読み取り専用で、
// 再解決などの操作は持たない。
export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("entitlements")
    .select(
      "id, entitlement_id, common_user_id, source_system_key, product_code, entitlement_type, quantity, application_status, application_decision, application_decision_reason, granted_at"
    )
    .not("application_decision", "is", null)
    .neq("application_decision", "APPLIED")
    .order("granted_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // 理由ごとの内訳。件数の偏りから「送信元が商品コードを付け忘れている」等に気づける。
  const countsByDecision: Record<string, number> = {};
  for (const row of rows) {
    const decision = row.application_decision as string;
    countsByDecision[decision] = (countsByDecision[decision] ?? 0) + 1;
  }

  return NextResponse.json({ rows, countsByDecision });
}
