import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { resizeForLine } from "@/lib/image-upload";
import { uploadToBlob } from "@/lib/blob-storage";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const TARGET_COLUMNS = { thumbnail: "thumbnail_url", main: "main_image_url" } as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const target = formData?.get("target");
  if (typeof target !== "string" || !(target in TARGET_COLUMNS)) {
    return NextResponse.json({ error: "target は thumbnail または main を指定してください" }, { status: 400 });
  }
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
  const path = `metaverse-images/areas/${id}-${target}-${Date.now()}.${resized.extension}`;

  const { publicUrl } = await uploadToBlob(path, resized.buffer, resized.contentType);

  const column = TARGET_COLUMNS[target as keyof typeof TARGET_COLUMNS];
  const { data, error } = await supabase
    .from("metaverse_areas")
    .update({ [column]: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction(await getAdminActorName(), "metaverse_area_image_upload", `area_id=${id} target=${target}`);
  return NextResponse.json(data);
}
