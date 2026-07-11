import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const EDITABLE_FIELDS = ["display_name", "polygon", "capacity", "status", "display_order"] as const;

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

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("metaverse_blocks")
    .update(fields)
    .eq("id", id)
    .select("*, metaverse_areas(id, name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "metaverse_block_update", `id=${id}`);
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();

  const { count } = await supabase.from("metaverse_properties").select("id", { count: "exact", head: true }).eq("block_id", id);
  if (count && count > 0) {
    return NextResponse.json({ error: "この街区に紐づく区画が存在するため削除できません" }, { status: 400 });
  }

  const { error } = await supabase.from("metaverse_blocks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "metaverse_block_delete", `id=${id}`);
  return NextResponse.json({ ok: true });
}
