import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { resizeForLine } from "@/lib/image-upload";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "画像ファイルを指定してください" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "画像ファイルのみアップロードできます" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "ファイルサイズは10MB以下にしてください" }, { status: 400 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  let resized;
  try {
    resized = await resizeForLine(inputBuffer);
  } catch (error) {
    console.error("画像のリサイズに失敗しました", error);
    return NextResponse.json({ error: "画像の処理に失敗しました。別の画像でお試しください。" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const path = `defaults/property-${Date.now()}.${resized.extension}`;

  const { error: uploadError } = await supabase.storage
    .from("metaverse-images")
    .upload(path, resized.buffer, { contentType: resized.contentType, upsert: true, cacheControl: "60" });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("metaverse-images").getPublicUrl(path);

  const { data: existing, error: existingError } = await supabase
    .from("metaverse_tour_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  let result;
  if (existing?.id) {
    result = await supabase
      .from("metaverse_tour_settings")
      .update({ default_property_image_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .single();
  } else {
    result = await supabase
      .from("metaverse_tour_settings")
      .insert({ default_property_image_url: publicUrl })
      .select("*")
      .single();
  }
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  await logAdminAction(await getAdminActorName(), "metaverse_default_property_image_update");
  return NextResponse.json(result.data);
}

export async function DELETE() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .from("metaverse_tour_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing?.id) {
    return NextResponse.json({ id: null, default_property_image_url: null });
  }

  const result = await supabase
    .from("metaverse_tour_settings")
    .update({ default_property_image_url: null, updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select("*")
    .single();
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  await logAdminAction(await getAdminActorName(), "metaverse_default_property_image_clear");
  return NextResponse.json(result.data);
}
