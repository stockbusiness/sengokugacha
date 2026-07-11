import { NextResponse } from "next/server";
import { logAdminAction } from "@/lib/admin-audit-log";
import { getAdminActorName, getAdminSession } from "@/lib/admin-session";
import { regenerateInboundApiKey } from "@/lib/agents";

// 受信用APIキーの(再)発行。平文はこのレスポンスでのみ返す。
export async function POST() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { rawKey } = await regenerateInboundApiKey();

  await logAdminAction(await getAdminActorName(), "agency_inbound_api_key_regenerate");
  return NextResponse.json({ raw_key: rawKey });
}
