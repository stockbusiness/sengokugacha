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
    .from("line_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    id: data?.id ?? null,
    liff_id: data?.liff_id ?? null,
    channel_id: data?.channel_id ?? null,
    messaging_channel_access_token_set: !!data?.messaging_channel_access_token,
    messaging_channel_access_token_last4: last4(data?.messaging_channel_access_token ?? null),
    rich_menu_id: data?.rich_menu_id ?? null,
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

  const fields: Record<string, unknown> = {
    liff_id: body.liff_id || null,
    channel_id: body.channel_id || null,
    updated_at: new Date().toISOString(),
  };

  // 空文字は「変更しない」を意味する(GETでは値そのものを返さないため)。
  if (typeof body.messaging_channel_access_token === "string" && body.messaging_channel_access_token.length > 0) {
    fields.messaging_channel_access_token = body.messaging_channel_access_token;
  }

  const supabase = createSupabaseServerClient();
  const { data: existing, error: fetchError } = await supabase
    .from("line_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const query = existing
    ? supabase.from("line_settings").update(fields).eq("id", existing.id)
    : supabase.from("line_settings").insert(fields);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "line_settings_update");

  return NextResponse.json({ ok: true });
}
