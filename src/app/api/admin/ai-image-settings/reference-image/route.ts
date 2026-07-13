import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { resizeForLine } from "@/lib/image-upload";
import { uploadToBlob } from "@/lib/blob-storage";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const TARGET_COLUMNS = {
  warlord: "warlord_reference_image_url",
  metaverse: "metaverse_reference_image_url",
} as const;

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const target = formData?.get("target");
  if (typeof target !== "string" || !(target in TARGET_COLUMNS)) {
    return NextResponse.json({ error: "target は warlord または metaverse を指定してください" }, { status: 400 });
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
  const path = `metaverse-images/ai-reference/${target}-${Date.now()}.${resized.extension}`;

  let publicUrl: string;
  try {
    ({ publicUrl } = await uploadToBlob(path, resized.buffer, resized.contentType));
  } catch (error) {
    console.error("画像のアップロードに失敗しました", error);
    return NextResponse.json(
      { error: `画像のアップロードに失敗しました。${error instanceof Error ? error.message : ""}` },
      { status: 502 }
    );
  }

  const column = TARGET_COLUMNS[target as keyof typeof TARGET_COLUMNS];
  const { data: existing, error: fetchError } = await supabase
    .from("ai_image_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const fields: Record<string, unknown> = { [column]: publicUrl, updated_at: new Date().toISOString() };
  const query = existing
    ? supabase.from("ai_image_settings").update(fields).eq("id", existing.id)
    : supabase.from("ai_image_settings").insert(fields);

  const { error: saveError } = await query;
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "ai_image_reference_upload", `target=${target}`);
  return NextResponse.json({ [column]: publicUrl });
}
