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
    .from("payment_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    id: data?.id ?? null,
    stripe_publishable_key: data?.stripe_publishable_key ?? null,
    stripe_secret_key_set: !!data?.stripe_secret_key,
    stripe_secret_key_last4: last4(data?.stripe_secret_key ?? null),
    stripe_webhook_secret_set: !!data?.stripe_webhook_secret,
    stripe_webhook_secret_last4: last4(data?.stripe_webhook_secret ?? null),
    kokudaka_pack_amount_yen: data?.kokudaka_pack_amount_yen ?? 500,
    kokudaka_pack_kokudaka: data?.kokudaka_pack_kokudaka ?? 500,
    gacha_ticket_pack_amount_yen: data?.gacha_ticket_pack_amount_yen ?? 150,
    gacha_ticket_pack_tickets: data?.gacha_ticket_pack_tickets ?? 1,
    monthly_spending_cap_yen: data?.monthly_spending_cap_yen ?? null,
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
    .from("payment_settings")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const fields: Record<string, unknown> = {
    kokudaka_pack_amount_yen: body.kokudaka_pack_amount_yen,
    kokudaka_pack_kokudaka: body.kokudaka_pack_kokudaka,
    gacha_ticket_pack_amount_yen: body.gacha_ticket_pack_amount_yen,
    gacha_ticket_pack_tickets: body.gacha_ticket_pack_tickets,
    monthly_spending_cap_yen:
      body.monthly_spending_cap_yen === "" || body.monthly_spending_cap_yen == null
        ? null
        : Number(body.monthly_spending_cap_yen),
    updated_at: new Date().toISOString(),
  };

  // 空文字は「変更しない」を意味する(GETでは値そのものを返さないため)。
  if (typeof body.stripe_publishable_key === "string" && body.stripe_publishable_key.length > 0) {
    fields.stripe_publishable_key = body.stripe_publishable_key;
  }
  if (typeof body.stripe_secret_key === "string" && body.stripe_secret_key.length > 0) {
    fields.stripe_secret_key = body.stripe_secret_key;
  }
  if (typeof body.stripe_webhook_secret === "string" && body.stripe_webhook_secret.length > 0) {
    fields.stripe_webhook_secret = body.stripe_webhook_secret;
  }

  const query = existing
    ? supabase.from("payment_settings").update(fields).eq("id", existing.id)
    : supabase.from("payment_settings").insert(fields);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(await getAdminActorName(), "payment_settings_update");

  return NextResponse.json({ ok: true });
}
