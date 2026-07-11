import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("metaverse_properties")
    .select("*, metaverse_areas(id, name), metaverse_building_types(id, name)")
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
  const propertyCode = body?.property_code;
  const name = body?.name;
  const areaId = body?.area_id;
  if (
    typeof propertyCode !== "string" ||
    propertyCode.length === 0 ||
    typeof name !== "string" ||
    name.length === 0 ||
    typeof areaId !== "string" ||
    areaId.length === 0
  ) {
    return NextResponse.json({ error: "property_code, name, area_id は必須です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("metaverse_properties")
    .insert({ property_code: propertyCode, name, area_id: areaId })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction(await getAdminActorName(), "metaverse_property_create", `property_code=${propertyCode}`);
  return NextResponse.json(data);
}
