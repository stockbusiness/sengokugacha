import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { resizeForRichMenu } from "@/lib/image-upload";
import { uploadToBlob } from "@/lib/blob-storage";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB(リサイズ前の元画像用)

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
    return NextResponse.json({ error: "ファイルサイズは15MB以下にしてください" }, { status: 400 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  let resized;
  try {
    resized = await resizeForRichMenu(inputBuffer);
  } catch (error) {
    console.error("リッチメニュー画像のリサイズに失敗しました", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "画像の処理に失敗しました。別の画像でお試しください。" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerClient();
  const path = `rich-menu-images/rich-menu-${Date.now()}.${resized.extension}`;

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

  const { data: existing, error: fetchError } = await supabase
    .from("line_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const fields = { rich_menu_image_url: publicUrl, updated_at: new Date().toISOString() };
  const query = existing
    ? supabase.from("line_settings").update(fields).eq("id", existing.id)
    : supabase.from("line_settings").insert(fields);

  const { error: updateError } = await query;
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "rich_menu_image_upload", `url=${publicUrl}`);

  return NextResponse.json({ ok: true, rich_menu_image_url: publicUrl });
}
