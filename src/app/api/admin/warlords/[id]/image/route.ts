import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { resizeForLine } from "@/lib/image-upload";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

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
    return NextResponse.json(
      { error: "画像の処理に失敗しました。別の画像でお試しください。" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerClient();
  const path = `warlords/${id}-${Date.now()}.${resized.extension}`;

  const { error: uploadError } = await supabase.storage
    .from("warlord-images")
    .upload(path, resized.buffer, { contentType: resized.contentType, upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("warlord-images").getPublicUrl(path);

  const { data, error: updateError } = await supabase
    .from("warlords")
    .update({ image_url: publicUrl })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await logAdminAction(await getAdminActorName(), "warlord_image_upload", `warlord_id=${id}`);

  return NextResponse.json(data);
}
