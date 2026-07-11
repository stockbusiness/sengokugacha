import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { recordPlotGeometryChange } from "@/lib/metaverse";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const EDITABLE_FIELDS = [
  "property_code",
  "name",
  "area_id",
  "building_type_id",
  "short_description",
  "description",
  "main_image_url",
  "feature_tags",
  "intended_use",
  "status",
  "is_recommended",
  "is_new",
  "display_order",
  "external_world_ref",
  "internal_price_yen",
  "internal_rights_note",
  "internal_benefits_note",
  "block_id",
  "internal_category",
  "polygon",
  "anchor_x",
  "anchor_y",
  "frontage_angle",
  "road_id",
  "size_rank",
  "location_rank",
  "map_version",
  "exterior_variant",
  "interior_variant",
  "crest_asset",
  "nameplate_text",
] as const;

const GEOMETRY_FIELDS = ["polygon", "anchor_x", "anchor_y"] as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();

  const [{ data: property, error: propertyError }, { data: images, error: imagesError }, { data: scenes, error: scenesError }] =
    await Promise.all([
      supabase
        .from("metaverse_properties")
        .select("*, metaverse_areas(id, name), metaverse_building_types(id, name)")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("metaverse_property_images").select("*").eq("property_id", id).order("display_order", { ascending: true }),
      supabase.from("metaverse_tour_scenes").select("*").eq("property_id", id).order("display_order", { ascending: true }),
    ]);

  if (propertyError) return NextResponse.json({ error: propertyError.message }, { status: 500 });
  if (!property) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (imagesError) return NextResponse.json({ error: imagesError.message }, { status: 500 });
  if (scenesError) return NextResponse.json({ error: scenesError.message }, { status: 500 });

  return NextResponse.json({ ...property, images: images ?? [], scenes: scenes ?? [] });
}

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

  const touchesGeometry = GEOMETRY_FIELDS.some((key) => key in fields);
  const supabase = createSupabaseServerClient();

  let before: { polygon: unknown; anchor_x: unknown; anchor_y: unknown } | null = null;
  if (touchesGeometry) {
    const { data: existing, error: existingError } = await supabase
      .from("metaverse_properties")
      .select("polygon, anchor_x, anchor_y")
      .eq("id", id)
      .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    before = existing;
  }

  const { data, error } = await supabase.from("metaverse_properties").update(fields).eq("id", id).select("*").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (touchesGeometry && before) {
    await recordPlotGeometryChange({
      propertyId: id,
      oldPolygon: before.polygon as [number, number][] | null,
      newPolygon: data.polygon,
      oldAnchorX: before.anchor_x != null ? Number(before.anchor_x) : null,
      oldAnchorY: before.anchor_y != null ? Number(before.anchor_y) : null,
      newAnchorX: data.anchor_x != null ? Number(data.anchor_x) : null,
      newAnchorY: data.anchor_y != null ? Number(data.anchor_y) : null,
      changedBy: await getAdminActorName(),
      mapVersion: data.map_version,
    });
  }

  await logAdminAction(await getAdminActorName(), "metaverse_property_update", `id=${id}`);
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("metaverse_properties").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction(await getAdminActorName(), "metaverse_property_delete", `id=${id}`);
  return NextResponse.json({ ok: true });
}
