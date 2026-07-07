import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const EDITABLE_FIELDS = [
  "name",
  "region",
  "display_order",
  "unlock_condition_count",
  "landmark_name",
  "theme_description",
  "has_castle_town",
  "castle_town_concept_art_url",
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

  const fields: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) fields[key] = body[key];
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("provinces").update(fields).eq("id", id).select("*").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
