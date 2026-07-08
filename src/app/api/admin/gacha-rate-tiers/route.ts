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
    .from("gacha_rate_tiers")
    .select("*")
    .order("tier_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const tierOrder = body?.tier_order;
  const rareRate = body?.rare_rate;
  const midRate = body?.mid_rate;
  const maxConqueredCount = body?.max_conquered_count ?? null;

  if (typeof tierOrder !== "number" || typeof rareRate !== "number" || typeof midRate !== "number") {
    return NextResponse.json(
      { error: "tier_order, rare_rate, mid_rate は必須です" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("gacha_rate_tiers")
    .insert({
      tier_order: tierOrder,
      max_conquered_count: maxConqueredCount,
      rare_rate: rareRate,
      mid_rate: midRate,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(
    await getAdminActorName(),
    "gacha_rate_tier_create",
    `tier_order=${tierOrder} max_conquered_count=${maxConqueredCount} rare_rate=${rareRate} mid_rate=${midRate}`
  );

  return NextResponse.json(data);
}
