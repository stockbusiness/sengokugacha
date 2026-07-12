import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { getAiImageSettings } from "@/lib/ai-image-settings";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function last4(value: string | null): string | null {
  if (!value) return null;
  return value.slice(-4);
}

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getAiImageSettings();

  return NextResponse.json({
    id: settings.id,
    provider: settings.provider,
    api_key_set: !!settings.api_key,
    api_key_last4: last4(settings.api_key),
    model: settings.model,
    gemini_api_key_set: !!settings.gemini_api_key,
    gemini_api_key_last4: last4(settings.gemini_api_key),
    gemini_model: settings.gemini_model,
    warlord_style_prompt_template: settings.warlord_style_prompt_template,
    metaverse_style_prompt_template: settings.metaverse_style_prompt_template,
    warlord_reference_image_url: settings.warlord_reference_image_url,
    metaverse_reference_image_url: settings.metaverse_reference_image_url,
    enabled_for_warlords: settings.enabled_for_warlords,
    enabled_for_metaverse: settings.enabled_for_metaverse,
  });
}

export async function PUT(request: NextRequest) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data: existing, error: fetchError } = await supabase
    .from("ai_image_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const fields: Record<string, unknown> = {
    provider: body.provider === "gemini" ? "gemini" : "openai",
    model: body.model,
    gemini_model: body.gemini_model,
    warlord_style_prompt_template: body.warlord_style_prompt_template ?? null,
    metaverse_style_prompt_template: body.metaverse_style_prompt_template ?? null,
    enabled_for_warlords: !!body.enabled_for_warlords,
    enabled_for_metaverse: !!body.enabled_for_metaverse,
    updated_at: new Date().toISOString(),
  };

  // 空文字は「変更しない」を意味する(GETでは値そのものを返さないため)。
  if (typeof body.api_key === "string" && body.api_key.length > 0) {
    fields.api_key = body.api_key;
  }
  if (typeof body.gemini_api_key === "string" && body.gemini_api_key.length > 0) {
    fields.gemini_api_key = body.gemini_api_key;
  }

  const query = existing
    ? supabase.from("ai_image_settings").update(fields).eq("id", existing.id)
    : supabase.from("ai_image_settings").insert(fields);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "ai_image_settings_update");

  return NextResponse.json({ ok: true });
}
