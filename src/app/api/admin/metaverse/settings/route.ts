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
    .from("metaverse_tour_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    data ?? { id: null, tour_token_ttl_minutes: 60, default_property_image_url: null, default_area_image_url: null }
  );
}

export async function PUT(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const ttl = body?.tour_token_ttl_minutes;
  if (typeof ttl !== "number" || ttl <= 0) {
    return NextResponse.json({ error: "tour_token_ttl_minutes は1以上の数値で指定してください" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  let result;
  if (body?.id) {
    result = await supabase
      .from("metaverse_tour_settings")
      .update({ tour_token_ttl_minutes: ttl, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .select("*")
      .single();
  } else {
    result = await supabase
      .from("metaverse_tour_settings")
      .insert({ tour_token_ttl_minutes: ttl })
      .select("*")
      .single();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  await logAdminAction(await getAdminActorName(), "metaverse_tour_settings_update");
  return NextResponse.json(result.data);
}
