import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const memberType = request.nextUrl.searchParams.get("memberType");
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("users")
    .select(
      "id, line_user_id, display_name, rank, kokudaka, senko, gacha_tickets, created_at, agents:referring_agent_id(name), is_founding_member, founding_member_number, development_plot_id, development_area, is_nation_builder, nation_builder_plan"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (q) {
    // PostgRESTのor()フィルタ構文で意味を持つ記号を除去しておく(管理者限定エンドポイントだが念のため)。
    const sanitized = q.replace(/[,()]/g, "");
    query = query.or(`display_name.ilike.%${sanitized}%,line_user_id.ilike.%${sanitized}%`);
  }

  if (memberType === "founding") query = query.eq("is_founding_member", true);
  else if (memberType === "builder") query = query.eq("is_nation_builder", true);
  else if (memberType === "general") query = query.eq("is_founding_member", false).eq("is_nation_builder", false);

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
    isFoundingMember: u.is_founding_member,
    foundingMemberNumber: u.founding_member_number,
    developmentPlotId: u.development_plot_id,
    developmentArea: u.development_area,
    isNationBuilder: u.is_nation_builder,
    nationBuilderPlan: u.nation_builder_plan,
  }));

  return NextResponse.json(rows);
}
