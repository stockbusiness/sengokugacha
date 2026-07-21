import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("purchases")
    .select(
      "id, item_type, amount, grant_amount, status, grant_status, grant_last_error, stripe_session_id, created_at, users(display_name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    buyerDisplayName: (r.users as unknown as { display_name: string | null } | null)?.display_name ?? "(未設定)",
    itemType: r.item_type,
    amount: r.amount,
    grantAmount: r.grant_amount,
    status: r.status,
    grantStatus: r.grant_status,
    grantLastError: r.grant_last_error,
    createdAt: r.created_at,
  }));

  return NextResponse.json(rows);
}
