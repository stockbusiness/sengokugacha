import { NextRequest, NextResponse } from "next/server";
import { upsertAgentFromSync, verifyInboundApiKey } from "@/lib/agents";

// sengoku-ai.com代理店連携API仕様書 5〜11章に準拠。
// 認証は x-api-key または Authorization: Bearer のどちらでも受け付ける。
function extractApiKey(request: NextRequest): string | null {
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) return headerKey;
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice("Bearer ".length);
  return null;
}

export async function POST(request: NextRequest) {
  const apiKey = extractApiKey(request);
  if (!(await verifyInboundApiKey(apiKey))) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, message: "invalid JSON body" }, { status: 422 });
  }

  // 接続テスト(dry_run)は認証確認のみ行い、データは保存しない。
  if (body.event === "connection_test" || body.dry_run === true) {
    return NextResponse.json({ success: true, data: { external_id: body.external_id ?? null, synced: false } });
  }

  const externalId = body.external_id;
  if (typeof externalId !== "string" || externalId.length === 0) {
    return NextResponse.json({ success: false, message: "external_id is required" }, { status: 422 });
  }
  const name = body.name;
  if (typeof name !== "string" || name.length === 0) {
    return NextResponse.json({ success: false, message: "name is required" }, { status: 422 });
  }

  try {
    const { agent, action } = await upsertAgentFromSync({
      external_id: externalId,
      parent_external_id: typeof body.parent_external_id === "string" ? body.parent_external_id : null,
      name,
      contact_name: typeof body.contact_name === "string" ? body.contact_name : null,
      contact_email: typeof body.contact_email === "string" ? body.contact_email : null,
      login_email: typeof body.login_email === "string" ? body.login_email : null,
      phone: typeof body.phone === "string" ? body.phone : null,
      line_url: typeof body.line_url === "string" ? body.line_url : null,
      status: typeof body.status === "string" ? body.status : null,
      role_level: typeof body.role_level === "number" ? body.role_level : null,
      role_label: typeof body.role_label === "string" ? body.role_label : null,
      lp_urls: body.lp_urls ?? null,
    });

    return NextResponse.json({
      success: true,
      data: { external_id: agent.external_id, status: agent.status, synced: true, action },
    });
  } catch (error) {
    console.error("代理店連携APIの受信処理に失敗しました", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
