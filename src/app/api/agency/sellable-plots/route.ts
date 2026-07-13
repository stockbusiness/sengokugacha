import { NextResponse } from "next/server";
import { getAgentSession } from "@/lib/agent-session";
import { getAvailablePlots } from "@/lib/castle-plots";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// 要件書12「全国の販売可能な城・区画一覧」。代理店はどの城の区画でも販売できる(5.2)。
export async function GET() {
  const session = await getAgentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const plots = await getAvailablePlots();
  if (plots.length === 0) return NextResponse.json([]);

  const castleIds = Array.from(new Set(plots.map((p) => p.castle_id)));
  const supabase = createSupabaseServerClient();
  const { data: castles, error } = await supabase.from("castles").select("id, name").in("id", castleIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const castleNameById = new Map((castles ?? []).map((c) => [c.id, c.name as string]));

  return NextResponse.json(
    plots.map((p) => ({ ...p, castleName: castleNameById.get(p.castle_id) ?? "" }))
  );
}
