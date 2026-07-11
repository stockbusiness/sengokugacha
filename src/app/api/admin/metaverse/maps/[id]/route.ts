import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const EDITABLE_FIELDS = [
  "name",
  "is_active",
  "status",
  "map_code",
  "version",
  "viewbox_width",
  "viewbox_height",
  "origin_x",
  "origin_y",
  "unity_scale",
] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of EDITABLE_FIELDS) {
    if (key in body) fields[key] = body[key];
  }
  if (fields.status === "published") fields.published_at = new Date().toISOString();

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("metaverse_maps").update(fields).eq("id", id).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "metaverse_map_update", `id=${id}`);
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();

  const { error: hotspotsError } = await supabase.from("metaverse_map_hotspots").delete().eq("map_id", id);
  if (hotspotsError) return NextResponse.json({ error: hotspotsError.message }, { status: 500 });

  const { error } = await supabase.from("metaverse_maps").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "metaverse_map_delete", `id=${id}`);
  return NextResponse.json({ ok: true });
}
