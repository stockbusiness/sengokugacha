import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const areaId = request.nextUrl.searchParams.get("area_id");
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("metaverse_blocks")
    .select("*, metaverse_areas(id, name)")
    .order("display_order", { ascending: true });
  if (areaId) query = query.eq("area_id", areaId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const areaId = body?.area_id;
  const blockCode = body?.block_code;
  const displayName = body?.display_name;
  if (typeof areaId !== "string" || typeof blockCode !== "string" || blockCode.length === 0 || typeof displayName !== "string" || displayName.length === 0) {
    return NextResponse.json({ error: "area_id, block_code, display_name は必須です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("metaverse_blocks")
    .insert({ area_id: areaId, block_code: blockCode, display_name: displayName })
    .select("*, metaverse_areas(id, name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "metaverse_block_create", `block_code=${blockCode}`);
  return NextResponse.json(data);
}
