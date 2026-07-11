import { NextRequest, NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { getAgencyIntegrationSettings } from "@/lib/agents";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getAgencyIntegrationSettings();
  // 送信用APIキーは平文保存だが、画面には全文を返さない(末尾4桁のみ)。
  return NextResponse.json({
    ...settings,
    outbound_api_key: undefined,
    outbound_api_key_set: !!settings.outbound_api_key,
    outbound_api_key_last4: settings.outbound_api_key ? settings.outbound_api_key.slice(-4) : null,
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

  const existing = await getAgencyIntegrationSettings();

  const fields: Record<string, unknown> = {
    outbound_endpoint_url: typeof body.outbound_endpoint_url === "string" ? body.outbound_endpoint_url : existing.outbound_endpoint_url,
    bidirectional_sync_enabled: !!body.bidirectional_sync_enabled,
    sso_enabled: !!body.sso_enabled,
    sso_issuer_url: typeof body.sso_issuer_url === "string" && body.sso_issuer_url ? body.sso_issuer_url : existing.sso_issuer_url,
    sso_jwks_url: typeof body.sso_jwks_url === "string" && body.sso_jwks_url ? body.sso_jwks_url : existing.sso_jwks_url,
    sso_audience: typeof body.sso_audience === "string" && body.sso_audience ? body.sso_audience : existing.sso_audience,
    updated_at: new Date().toISOString(),
  };
  // 空欄のまま保存した場合は「変更しない」扱いにする(payment_settingsと同じ運用)。
  if (typeof body.outbound_api_key === "string" && body.outbound_api_key.length > 0) {
    fields.outbound_api_key = body.outbound_api_key;
  }

  const supabase = createSupabaseServerClient();
  let result;
  if (existing.id) {
    result = await supabase.from("agency_integration_settings").update(fields).eq("id", existing.id).select("*").single();
  } else {
    result = await supabase.from("agency_integration_settings").insert(fields).select("*").single();
  }
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  await logAdminAction(await getAdminActorName(), "agency_integration_settings_update");
  return NextResponse.json({ ...result.data, outbound_api_key: undefined });
}
