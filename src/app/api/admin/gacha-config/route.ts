import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("gacha_config")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    data ?? {
      id: null,
      base_daily_free_limit: 1,
      base_daily_paid_limit: 3,
      event_free_limit_override: null,
      event_paid_limit_override: null,
      event_start_at: null,
      event_end_at: null,
      preset_name: null,
      streak_bonus_7day_draws: 1,
      streak_bonus_30day_draws: 2,
    }
  );
}

export async function PUT(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const fields = {
    base_daily_free_limit: body.base_daily_free_limit,
    base_daily_paid_limit: body.base_daily_paid_limit,
    event_free_limit_override: body.event_free_limit_override,
    event_paid_limit_override: body.event_paid_limit_override,
    event_start_at: body.event_start_at,
    event_end_at: body.event_end_at,
    preset_name: body.preset_name,
    streak_bonus_7day_draws: body.streak_bonus_7day_draws,
    streak_bonus_30day_draws: body.streak_bonus_30day_draws,
    updated_at: new Date().toISOString(),
  };

  const supabase = createSupabaseServerClient();

  if (body.id) {
    const { data, error } = await supabase
      .from("gacha_config")
      .update(fields)
      .eq("id", body.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabase.from("gacha_config").insert(fields).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
