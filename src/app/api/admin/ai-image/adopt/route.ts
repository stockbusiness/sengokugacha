import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { resizeForLine } from "@/lib/image-upload";
import { AI_IMAGE_TARGETS, isAiImageEntityType, type AiImageEntityType } from "@/lib/ai-image-targets";
import { renderWarlordCard } from "@/lib/card-template";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { generation_id, image_base64 } = body as { generation_id?: unknown; image_base64?: unknown };
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

  let inputBuffer: Buffer;
  try {
    inputBuffer = Buffer.from(image_base64, "base64");
  } catch {
    return NextResponse.json({ error: "画像データの読み込みに失敗しました" }, { status: 400 });
  }

  // 武将カードのみ、AI生成イラストの上にレアリティ別の枠・武将名・スキル名・ステータス・
  // フレーバーテキストを合成する(AIにテキストまで生成させるとDBの実データとズレるため)。
  if (entityType === "warlord") {
    const { data: warlord, error: warlordError } = await supabase
      .from("warlords")
      .select("name, rarity, skill_name, stats_json, lore, provinces(name)")
      .eq("id", entityId)
      .maybeSingle();
    if (warlordError) return NextResponse.json({ error: warlordError.message }, { status: 500 });
    if (warlord) {
      const province = warlord.provinces as unknown as { name: string } | { name: string }[] | null;
      const provinceName = Array.isArray(province) ? (province[0]?.name ?? "") : (province?.name ?? "");
      try {
        inputBuffer = await renderWarlordCard(inputBuffer, {
          name: warlord.name,
          rarity: warlord.rarity,
          provinceName,
          skillName: warlord.skill_name,
          stats: warlord.stats_json as Record<string, unknown> | null,
          lore: warlord.lore,
        });
      } catch (error) {
        console.error("カードテンプレートの合成に失敗しました", error);
        return NextResponse.json({ error: "カードの合成に失敗しました。" }, { status: 500 });
      }
    }
  }

  let resized;
  try {
    resized = await resizeForLine(inputBuffer);
  } catch (error) {
    console.error("画像のリサイズに失敗しました", error);
    return NextResponse.json({ error: "画像の処理に失敗しました。" }, { status: 400 });
  }

  const path = `${targetDef.pathPrefix}/${entityId}-ai-${Date.now()}.${resized.extension}`;
  const { error: uploadError } = await supabase.storage
    .from(targetDef.bucket)
    .upload(path, resized.buffer, { contentType: resized.contentType, upsert: true, cacheControl: "60" });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const {
    data: { publicUrl },
  } = supabase.storage.from(targetDef.bucket).getPublicUrl(path);

  const column = targetDef.resolveColumn(generation.target as string | null);
  const { data: updatedEntity, error: updateError } = await supabase
    .from(targetDef.table)
    .update({ [column]: publicUrl })
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
