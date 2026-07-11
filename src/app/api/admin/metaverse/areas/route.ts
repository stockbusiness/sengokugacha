import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("metaverse_areas").select("*").order("display_order", { ascending: true });

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
  const slug = body?.slug;
  const name = body?.name;
  if (typeof slug !== "string" || slug.length === 0 || typeof name !== "string" || name.length === 0) {
    return NextResponse.json({ error: "slug と name は必須です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("metaverse_areas").insert({ slug, name }).select("*").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction(await getAdminActorName(), "metaverse_area_create", `slug=${slug}`);
  return NextResponse.json(data);
}
