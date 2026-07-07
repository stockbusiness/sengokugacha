import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("achievements")
    .select(
      "id, achievement_type, achieved_at, users(display_name), agents:referring_agent_id(name), warlords:selected_warlord_id(name)"
    )
    .order("achieved_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    achievementType: r.achievement_type,
    userDisplayName: (r.users as unknown as { display_name: string | null } | null)?.display_name ?? "(未設定)",
    referringAgentName: (r.agents as unknown as { name: string } | null)?.name ?? null,
    selectedWarlordName: (r.warlords as unknown as { name: string } | null)?.name ?? null,
    achievedAt: r.achieved_at,
  }));

  return NextResponse.json(rows);
}
