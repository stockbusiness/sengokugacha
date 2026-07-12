import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { resizeForLine } from "@/lib/image-upload";
import { uploadToBlob } from "@/lib/blob-storage";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB(指示書29章の上限に合わせる)

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const setAsMain = formData?.get("set_as_main") === "true";
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
  const path = `metaverse-images/properties/${id}-${Date.now()}.${resized.extension}`;

  const { publicUrl } = await uploadToBlob(path, resized.buffer, resized.contentType);

  const { data: imageRow, error: insertError } = await supabase
    .from("metaverse_property_images")
    .insert({ property_id: id, image_url: publicUrl })
    .select("*")
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (setAsMain) {
    const { error: updateError } = await supabase
      .from("metaverse_properties")
      .update({ main_image_url: publicUrl })
      .eq("id", id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  await logAdminAction(await getAdminActorName(), "metaverse_property_image_upload", `property_id=${id}`);
  return NextResponse.json(imageRow);
}
