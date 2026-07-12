import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { resizeForLine, uploadImageAndVerify, ImageUploadVerificationError } from "@/lib/image-upload";
import { AI_IMAGE_TARGETS, isAiImageEntityType, type AiImageEntityType } from "@/lib/ai-image-targets";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { generation_id, image_base64, portrait_base64 } = body as {
    generation_id?: unknown;
    image_base64?: unknown;
    portrait_base64?: unknown;
  };
  if (typeof generation_id !== "string" || !generation_id) {
    return NextResponse.json({ error: "generation_id を指定してください" }, { status: 400 });
  }
  if (typeof image_base64 !== "string" || !image_base64) {
    return NextResponse.json({ error: "image_base64 を指定してください" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data: generation, error: fetchError } = await supabase
    .from("ai_generated_images")
    .select("*")
    .eq("id", generation_id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!generation) return NextResponse.json({ error: "生成履歴が見つかりません" }, { status: 404 });
  if (!isAiImageEntityType(generation.entity_type)) {
    return NextResponse.json({ error: "entity_type が不正です" }, { status: 400 });
  }

  const entityType = generation.entity_type as AiImageEntityType;
  const entityId = generation.entity_id as string;
  const targetDef = AI_IMAGE_TARGETS[entityType];

  // 武将カードの場合、image_base64は既にgenerateの段階でカード合成済み(プレビューで
  // 見えている見た目がそのまま保存される)。portrait_base64があれば、素のイラスト
  // (枠・文字なし)を「現在の画像を参照する」用に別途保存する。
  let inputBuffer: Buffer;
  try {
    inputBuffer = Buffer.from(image_base64, "base64");
  } catch {
    return NextResponse.json({ error: "画像データの読み込みに失敗しました" }, { status: 400 });
  }

  let resized;
  try {
    resized = await resizeForLine(inputBuffer);
  } catch (error) {
    console.error("画像のリサイズに失敗しました", error);
    return NextResponse.json({ error: "画像の処理に失敗しました。" }, { status: 400 });
  }

  const path = `${targetDef.pathPrefix}/${entityId}-ai-${Date.now()}.${resized.extension}`;
  let publicUrl: string;
  try {
    ({ publicUrl } = await uploadImageAndVerify(supabase, targetDef.bucket, path, resized.buffer, resized.contentType));
  } catch (error) {
    if (error instanceof ImageUploadVerificationError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }

  const column = targetDef.resolveColumn(generation.target as string | null);
  const fields: Record<string, unknown> = { [column]: publicUrl };

  // 素のイラスト(枠・文字なし)も保存し、次回「現在の画像を参照する」で使えるようにする。
  if (entityType === "warlord" && typeof portrait_base64 === "string" && portrait_base64) {
    try {
      const portraitBuffer = Buffer.from(portrait_base64, "base64");
      const resizedPortrait = await resizeForLine(portraitBuffer);
      const portraitPath = `warlords/portraits/${entityId}-ai-${Date.now()}.${resizedPortrait.extension}`;
      const { publicUrl: portraitPublicUrl } = await uploadImageAndVerify(
        supabase,
        targetDef.bucket,
        portraitPath,
        resizedPortrait.buffer,
        resizedPortrait.contentType
      );
      fields.ai_portrait_url = portraitPublicUrl;
    } catch (error) {
      // 素のイラストの保存に失敗しても、カード画像自体の採用は継続する(次回の参照精度が
      // 落ちるだけなので、ここで全体を失敗させるほどではない)。
      console.error("素のイラストの保存に失敗しました", error);
    }
  }

  const { data: updatedEntity, error: updateError } = await supabase
    .from(targetDef.table)
    .update(fields)
    .eq("id", entityId)
    .select("*")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // 物件のメイン画像は、既存の手動アップロードと同様にギャラリー(metaverse_property_images)にも追加する。
  if (entityType === "metaverse_property") {
    const { error: galleryError } = await supabase
      .from("metaverse_property_images")
      .insert({ property_id: entityId, image_url: publicUrl });
    if (galleryError) return NextResponse.json({ error: galleryError.message }, { status: 500 });
  }

  const { error: markAdoptedError } = await supabase
    .from("ai_generated_images")
    .update({ adopted: true, image_url: publicUrl })
    .eq("id", generation_id);
  if (markAdoptedError) return NextResponse.json({ error: markAdoptedError.message }, { status: 500 });

  await logAdminAction(
    await getAdminActorName(),
    "ai_image_adopt",
    `entity_type=${entityType} entity_id=${entityId}`
  );

  return NextResponse.json({ ok: true, image_url: publicUrl, entity: updatedEntity });
}
