import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("metaverse_tour_sessions")
    .select("id, user_id, agent_id, property_id, issued_at, expires_at, access_count, status, users(display_name), agents(name), metaverse_properties(name)")
    .order("issued_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
