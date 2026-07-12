import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function last4(value: string | null): string | null {
  if (!value) return null;
  return value.slice(-4);
}

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_image_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    id: data?.id ?? null,
    provider: data?.provider ?? "openai",
    api_key_set: !!data?.api_key,
    api_key_last4: last4(data?.api_key ?? null),
    model: data?.model ?? "gpt-image-1",
    style_prompt_template: data?.style_prompt_template ?? null,
    warlord_reference_image_url: data?.warlord_reference_image_url ?? null,
    metaverse_reference_image_url: data?.metaverse_reference_image_url ?? null,
    enabled_for_warlords: data?.enabled_for_warlords ?? true,
    enabled_for_metaverse: data?.enabled_for_metaverse ?? true,
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
    model: body.model,
    style_prompt_template: body.style_prompt_template ?? null,
    enabled_for_warlords: !!body.enabled_for_warlords,
    enabled_for_metaverse: !!body.enabled_for_metaverse,
    updated_at: new Date().toISOString(),
  };

  // 空文字は「変更しない」を意味する(GETでは値そのものを返さないため)。
  if (typeof body.api_key === "string" && body.api_key.length > 0) {
    fields.api_key = body.api_key;
  }

  const query = existing
    ? supabase.from("ai_image_settings").update(fields).eq("id", existing.id)
    : supabase.from("ai_image_settings").insert(fields);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "ai_image_settings_update");

  return NextResponse.json({ ok: true });
}
