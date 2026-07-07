import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_sales")
    .select("id, amount, type, source, created_at, agents(name), buyer:buyer_user_id(display_name)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    agentName: (r.agents as unknown as { name: string } | null)?.name ?? "(不明)",
    buyerDisplayName: (r.buyer as unknown as { display_name: string | null } | null)?.display_name ?? "(未設定)",
    amount: r.amount,
    type: r.type,
    source: r.source,
    createdAt: r.created_at,
  }));

  if (request.nextUrl.searchParams.get("format") === "csv") {
    const header = "created_at,agent_name,buyer_display_name,amount,type,source";
    const lines = rows.map((r) =>
      [r.createdAt, r.agentName, r.buyerDisplayName, String(r.amount), r.type, r.source]
        .map(csvEscape)
        .join(",")
    );
    const csv = [header, ...lines].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=agent_sales.csv",
      },
    });
  }

  return NextResponse.json(rows);
}
