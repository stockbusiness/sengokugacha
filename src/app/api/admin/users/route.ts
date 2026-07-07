import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("users")
    .select(
      "id, line_user_id, display_name, rank, kokudaka, senko, gacha_tickets, created_at, agents:referring_agent_id(name)"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (q) {
    // PostgRESTのor()フィルタ構文で意味を持つ記号を除去しておく(管理者限定エンドポイントだが念のため)。
    const sanitized = q.replace(/[,()]/g, "");
    query = query.or(`display_name.ilike.%${sanitized}%,line_user_id.ilike.%${sanitized}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((u) => ({
    id: u.id,
    lineUserId: u.line_user_id,
    displayName: u.display_name,
    rank: u.rank,
    kokudaka: u.kokudaka,
    senko: u.senko,
    gachaTickets: u.gacha_tickets,
    referringAgentName: (u.agents as unknown as { name: string } | null)?.name ?? null,
    createdAt: u.created_at,
  }));

  return NextResponse.json(rows);
}
