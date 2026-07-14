import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") fields.name = body.name.trim();
  if ("prefecture" in body) fields.prefecture = body.prefecture || null;
  if ("region" in body) fields.region = body.region || null;
  if ("description" in body) fields.description = body.description || null;
  if ("historical_lord_summary" in body) fields.historical_lord_summary = body.historical_lord_summary || null;
  if (
    typeof body.unlock_level === "string" &&
    ["PUBLIC", "PROVINCE_CONQUEST_REQUIRED", "REGION_CONQUEST_REQUIRED", "UNPUBLISHED"].includes(body.unlock_level)
  ) {
    fields.unlock_level = body.unlock_level;
  }
  if (
    typeof body.historical_review_status === "string" &&
    ["unreviewed", "reviewed"].includes(body.historical_review_status)
  ) {
    fields.historical_review_status = body.historical_review_status;
  }
  if ("main_image_url" in body) fields.main_image_url = body.main_image_url || null;
  if (Number.isFinite(body.display_order)) fields.display_order = body.display_order;
  if (typeof body.status === "string" && ["draft", "recruiting", "published", "hidden"].includes(body.status)) {
    fields.status = body.status;
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("castles").update(fields).eq("id", id).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "castle_update", `castle_id=${id}`);

  return NextResponse.json(data);
}
