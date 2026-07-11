import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const RIGHT_TYPES = ["ownership", "special_usage_right", "rental", "management", "reserved"] as const;

export async function GET(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const propertyId = request.nextUrl.searchParams.get("property_id");
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("metaverse_plot_rights")
    .select("*, metaverse_properties(id, property_code, name), users(id, display_name), agents(id, name)")
    .order("assigned_at", { ascending: false });
  if (propertyId) query = query.eq("property_id", propertyId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const propertyId = body?.property_id;
  const rightType = body?.right_type;
  if (typeof propertyId !== "string" || !(RIGHT_TYPES as readonly string[]).includes(rightType)) {
    return NextResponse.json({ error: "property_id, right_type(有効な値)は必須です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("metaverse_plot_rights")
    .insert({
      property_id: propertyId,
      right_type: rightType,
      user_id: typeof body.user_id === "string" && body.user_id ? body.user_id : null,
      agency_id: typeof body.agency_id === "string" && body.agency_id ? body.agency_id : null,
      order_reference: typeof body.order_reference === "string" ? body.order_reference : null,
      start_date: typeof body.start_date === "string" && body.start_date ? body.start_date : null,
      end_date: typeof body.end_date === "string" && body.end_date ? body.end_date : null,
    })
    .select("*, metaverse_properties(id, property_code, name), users(id, display_name), agents(id, name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "metaverse_plot_right_create", `property_id=${propertyId} right_type=${rightType}`);
  return NextResponse.json(data);
}
