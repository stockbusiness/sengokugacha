import { NextRequest, NextResponse } from "next/server";
import { upsertAgentFromSync, verifyInboundApiKey } from "@/lib/agents";
import { handleAssignedAgentUpdated, handleCommonUserMerged } from "@/lib/agency-events";

// sengoku-ai.com代理店連携API仕様書 5〜11章に準拠。
// 認証は x-api-key または Authorization: Bearer のどちらでも受け付ける。
function extractApiKey(request: NextRequest): string | null {
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) return headerKey;
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice("Bearer ".length);
  return null;
}

// このエンドポイントが代理店upsertとして処理するイベント種別(ガイド11.1章の
// 代理店ライフサイクルイベント)。event未指定の場合は既存動作通り常に代理店upsertとして扱う
// (pushAgentToExternal()等、このアプリ自身が送るリクエストはeventを付けないため)。
const AGENT_LIFECYCLE_EVENTS = new Set([
  "admin_created",
  "admin_updated",
  "role_updated",
  "approved",
  "promoted",
  "deactivated",
  "deleted",
]);

// 全体統合対応 実装計画(PR4)。共通顧客HUBイベントのうち、パスポート側で実際に
// 処理するもの(common_user_id・代理店情報の実装対象)。認証方式・エンドポイントは
// 変更せず、このMapに登録したイベントだけ本文の内容に応じた処理を行う。
const COMMON_USER_HUB_EVENT_HANDLERS: Record<string, (body: Record<string, unknown>) => Promise<void>> = {
  "common_user.merged": handleCommonUserMerged,
  "common_user.assigned_agent.updated": handleAssignedAgentUpdated,
};

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

  const event = typeof body.event === "string" ? body.event : null;

  // common_user.merged / common_user.assigned_agent.updated は実処理する(PR4)。
  if (event && COMMON_USER_HUB_EVENT_HANDLERS[event]) {
    try {
      await COMMON_USER_HUB_EVENT_HANDLERS[event](body);
    } catch (error) {
      console.error(`[integrations/agencies] ${event}の処理に失敗しました`, error);
      return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { event, processed: true } });
  }

  // それ以外の未対応イベント種別(lead_created等)は、対応実装が入るまで200で受理し
  // 処理対象外として無視する。相手側の失敗ログ・再送ループを防ぐための堅牢化
  // (sengoku-ai.com側からの回答で推奨された方式)。
  if (event && !AGENT_LIFECYCLE_EVENTS.has(event)) {
    console.log(`[integrations/agencies] 未対応のイベントを受理・無視しました: event=${event}`);
    return NextResponse.json({ success: true, data: { event, processed: false } });
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
