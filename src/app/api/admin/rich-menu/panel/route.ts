import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { RICH_MENU_BUTTONS } from "@/lib/rich-menu";
import { composeFullRichMenuSheet, DEFAULT_PANEL_SLUGS } from "@/lib/rich-menu-compose";
import { uploadToBlob } from "@/lib/blob-storage";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import sharp from "sharp";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
// パネル1枚の元画像として保管するサイズ(合成処理・保管容量を抑えつつ十分な画質を保つ)。
const PANEL_SOURCE_MAX_DIMENSION = 1600;

export async function POST(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const slotIndex = Number(formData.get("slot_index"));
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 5) {
    return NextResponse.json({ error: "slot_index は0〜5で指定してください" }, { status: 400 });
  }

  const file = formData.get("file");
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
  let normalizedBuffer: Buffer;
  try {
    normalizedBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({
        width: PANEL_SOURCE_MAX_DIMENSION,
        height: PANEL_SOURCE_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer();
  } catch (error) {
    console.error("パネル画像の処理に失敗しました", error);
    return NextResponse.json({ error: "画像の処理に失敗しました。別の画像でお試しください。" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const panelPath = `rich-menu-images/rich-menu-panels/${slotIndex}-${Date.now()}.webp`;

  let panelUrl: string;
  try {
    ({ publicUrl: panelUrl } = await uploadToBlob(panelPath, normalizedBuffer, "image/webp"));
  } catch (error) {
    console.error("パネル画像のアップロードに失敗しました", error);
    return NextResponse.json(
      { error: `画像のアップロードに失敗しました。${error instanceof Error ? error.message : ""}` },
      { status: 502 }
    );
  }

  const actorName = await getAdminActorName();

  const { error: panelUpsertError } = await supabase.from("rich_menu_panels").upsert(
    {
      slot_index: slotIndex,
      label: RICH_MENU_BUTTONS[slotIndex].label,
      source_image_url: panelUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "slot_index" }
  );
  if (panelUpsertError) return NextResponse.json({ error: panelUpsertError.message }, { status: 500 });

  // 他の5枠は、カスタマイズ済みならその画像、未設定なら同梱の既定パネルを使って
  // シート全体(2500×1686)を作り直す。
  const { data: allPanels, error: fetchPanelsError } = await supabase
    .from("rich_menu_panels")
    .select("slot_index, source_image_url");
  if (fetchPanelsError) return NextResponse.json({ error: fetchPanelsError.message }, { status: 500 });

  const bySlot = new Map((allPanels ?? []).map((row) => [row.slot_index, row.source_image_url as string]));
  const baseUrl = request.nextUrl.origin;

  const panelBuffers: Buffer[] = [];
  for (let i = 0; i < 6; i++) {
    const url = bySlot.get(i) ?? `${baseUrl}/rich-menu-panels/${DEFAULT_PANEL_SLUGS[i]}.webp`;
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `パネル画像(${url})の取得に失敗しました` }, { status: 500 });
    }
    panelBuffers.push(Buffer.from(await res.arrayBuffer()));
  }

  let sheetBuffer: Buffer;
  try {
    sheetBuffer = await composeFullRichMenuSheet(panelBuffers);
  } catch (error) {
    console.error("リッチメニュー画像の合成に失敗しました", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "リッチメニュー画像の合成に失敗しました" },
      { status: 500 }
    );
  }

  const sheetPath = `rich-menu-images/rich-menu-${Date.now()}.jpg`;
  let sheetUrl: string;
  try {
    ({ publicUrl: sheetUrl } = await uploadToBlob(sheetPath, sheetBuffer, "image/jpeg"));
  } catch (error) {
    console.error("リッチメニュー画像のアップロードに失敗しました", error);
    return NextResponse.json(
      { error: `画像のアップロードに失敗しました。${error instanceof Error ? error.message : ""}` },
      { status: 502 }
    );
  }

  const { data: existingSettings, error: settingsFetchError } = await supabase
    .from("line_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (settingsFetchError) return NextResponse.json({ error: settingsFetchError.message }, { status: 500 });

  const settingsFields = { rich_menu_image_url: sheetUrl, updated_at: new Date().toISOString() };
  const settingsQuery = existingSettings
    ? supabase.from("line_settings").update(settingsFields).eq("id", existingSettings.id)
    : supabase.from("line_settings").insert(settingsFields);
  const { error: settingsError } = await settingsQuery;
  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });

  await logAdminAction(actorName, "rich_menu_panel_upload", `slot_index=${slotIndex} label=${RICH_MENU_BUTTONS[slotIndex].label}`);

  return NextResponse.json({ ok: true, slotIndex, panelUrl, richMenuImageUrl: sheetUrl });
}
