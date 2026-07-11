import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("metaverse_building_types")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = body?.name;
  if (typeof name !== "string" || name.length === 0) {
    return NextResponse.json({ error: "name は必須です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("metaverse_building_types").insert({ name }).select("*").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
