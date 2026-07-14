import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { getPrimaryProvinceIdsByCastle } from "@/lib/castles";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("castles").select("*").order("display_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const primaryProvinceIds = await getPrimaryProvinceIdsByCastle((data ?? []).map((c) => c.id as string));
  const result = (data ?? []).map((c) => ({
    ...c,
    primary_province_id: primaryProvinceIds.get(c.id as string) ?? null,
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "城名は必須です" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("castles")
    .insert({
      name,
      prefecture: body?.prefecture || null,
      region: body?.region || null,
      description: body?.description || null,
      display_order: Number.isFinite(body?.display_order) ? body.display_order : 0,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "castle_create", `castle_id=${data.id} name=${name}`);

  return NextResponse.json(data);
}
