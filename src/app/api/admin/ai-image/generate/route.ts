import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { AiImageGenerationError, generateImage } from "@/lib/ai-image";
import { getAiImageSettings } from "@/lib/ai-image-settings";
import { AI_IMAGE_TARGETS, isAiImageEntityType, isWarlordEntity } from "@/lib/ai-image-targets";
import { renderWarlordCard } from "@/lib/card-template";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type UseReference = "none" | "style" | "current";

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { entity_type, entity_id, target, prompt, use_reference } = body as {
    entity_type?: unknown;
    entity_id?: unknown;
    target?: unknown;
    prompt?: unknown;
    use_reference?: unknown;
  };

  if (!isAiImageEntityType(entity_type)) {
    return NextResponse.json({ error: "entity_type が不正です" }, { status: 400 });
  }
  if (typeof entity_id !== "string" || !entity_id) {
    return NextResponse.json({ error: "entity_id を指定してください" }, { status: 400 });
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "プロンプトを入力してください" }, { status: 400 });
  }
  const useReference: UseReference =
    use_reference === "style" || use_reference === "current" ? use_reference : "none";

  const settings = await getAiImageSettings();
  const isWarlord = isWarlordEntity(entity_type);
  if (isWarlord && !settings.enabled_for_warlords) {
    return NextResponse.json({ error: "武将画像のAI生成は現在無効になっています(設定画面で有効化してください)" }, { status: 400 });
  }
  if (!isWarlord && !settings.enabled_for_metaverse) {
    return NextResponse.json({ error: "内覧画像のAI生成は現在無効になっています(設定画面で有効化してください)" }, { status: 400 });
  }

  const targetDef = AI_IMAGE_TARGETS[entity_type];
  const supabase = createSupabaseServerClient();

  let referenceImageUrl: string | null = null;
  if (useReference === "style") {
    referenceImageUrl = isWarlord ? settings.warlord_reference_image_url : settings.metaverse_reference_image_url;
  } else if (useReference === "current") {
    // 武将カードはimage_urlに枠・文字が焼き込み済みのため、それを参照に使うと合成物が
    // AIに模写されてしまう。参照には常に素のイラスト(ai_portrait_url)を使う。
    const column = isWarlord ? "ai_portrait_url" : targetDef.resolveColumn(typeof target === "string" ? target : undefined);
    const { data: entity, error: entityError } = await supabase
      .from(targetDef.table)
      .select(`${column}${isWarlord ? ", image_url" : ""}`)
      .eq("id", entity_id)
      .maybeSingle();
    if (entityError) return NextResponse.json({ error: entityError.message }, { status: 500 });
    const entityRecord = entity as Record<string, unknown> | null;
    // ai_portrait_urlが無い(過去にAI生成を一度も採用したことがない)場合のみ、image_urlに
    // フォールバックする(手動アップロード等でしか画像が無いケース)。
    referenceImageUrl = (entityRecord?.[column] as string | null) ?? (isWarlord ? (entityRecord?.image_url as string | null) : null);
    if (!referenceImageUrl) {
      return NextResponse.json({ error: "現在の画像が未設定のため、この対象を参照できません" }, { status: 400 });
    }
  }

  let portraitBuffer: Buffer;
  let stylePromptUsed: string | null;
  let providerUsed: "openai" | "gemini";
  let modelUsed: string;
  try {
    const result = await generateImage(prompt, {
      referenceImageUrl,
      size: targetDef.defaultSize,
      audience: isWarlord ? "warlord" : "metaverse",
    });
    portraitBuffer = result.buffer;
    stylePromptUsed = result.stylePromptUsed;
    providerUsed = result.providerUsed;
    modelUsed = result.modelUsed;
  } catch (error) {
    if (error instanceof AiImageGenerationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("AI画像生成に失敗しました", error);
    return NextResponse.json({ error: "画像生成に失敗しました。" }, { status: 500 });
  }

  // 武将カードは、採用する前(プレビュー段階)でカード合成まで済ませ、実際に保存される
  // 見た目をそのまま確認できるようにする(合成をadopt時まで遅らせると、プレビューでは
  // 枠なしのイラストしか見えず判断できないという指摘を受けて変更)。
  let cardImageBuffer: Buffer | null = null;
  if (isWarlord) {
    const { data: warlord, error: warlordError } = await supabase
      .from("warlords")
      .select("name, rarity, skill_name, stats_json, lore, provinces(name)")
      .eq("id", entity_id)
      .maybeSingle();
    if (warlordError) return NextResponse.json({ error: warlordError.message }, { status: 500 });
    if (warlord) {
      const province = warlord.provinces as unknown as { name: string } | { name: string }[] | null;
      const provinceName = Array.isArray(province) ? (province[0]?.name ?? "") : (province?.name ?? "");
      try {
        cardImageBuffer = await renderWarlordCard(portraitBuffer, {
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

  const { data: generation, error: insertError } = await supabase
    .from("ai_generated_images")
    .insert({
      entity_type,
      entity_id,
      target: typeof target === "string" ? target : null,
      prompt,
      style_prompt_snapshot: stylePromptUsed,
      reference_image_url: referenceImageUrl,
      provider: providerUsed,
      model: modelUsed,
      adopted: false,
    })
    .select("id")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await logAdminAction(
    await getAdminActorName(),
    "ai_image_generate",
    `entity_type=${entity_type} entity_id=${entity_id} provider=${providerUsed}`
  );

  return NextResponse.json({
    generation_id: generation.id,
    image_base64: (cardImageBuffer ?? portraitBuffer).toString("base64"),
    portrait_base64: cardImageBuffer ? portraitBuffer.toString("base64") : undefined,
    provider_used: providerUsed,
    fallback_used: providerUsed !== settings.provider,
  });
}
