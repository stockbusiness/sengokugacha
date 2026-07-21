import { NextRequest, NextResponse } from "next/server";
import { SenNoKuniHubAuthError, verifySenNoKuniHubRequest } from "@/lib/sen-no-kuni-hub-auth";
import { claimInboxEvent, computePayloadHash, markInboxEventFailed, markInboxEventSucceeded } from "@/lib/integration-inbox";
import { handleEntitlementGranted, handleEntitlementRevoked, handleEntitlementUpdated } from "@/lib/entitlements";
import { handleAssignedAgentUpdated } from "@/lib/agency-events";

// 千ノ国パスポート 全体統合対応 実装計画(PR6)。00_COMMON_INTEGRATION_CONTRACT.md
// 6章に準拠した新規HMAC連携の受信エンドポイント。既存の/api/integrations/agencies
// (APIキー認証、sengoku-ai.com専用)とは別パスであり、認証方式・処理内容ともに独立している。
const EVENT_HANDLERS: Record<string, (body: Record<string, unknown>) => Promise<void>> = {
  "entitlement.granted": handleEntitlementGranted,
  "entitlement.updated": handleEntitlementUpdated,
  "entitlement.revoked": handleEntitlementRevoked,
  // common_user.assigned_agent.updated(旧チャネル、PR4)と同じ内部関数を共有する。
  "customer.assignment.changed": handleAssignedAgentUpdated,
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let identity;
  try {
    identity = await verifySenNoKuniHubRequest(request, rawBody);
  } catch (error) {
    if (error instanceof SenNoKuniHubAuthError) {
      return NextResponse.json({ ok: false, error: { code: error.code, message: error.message } }, { status: 401 });
    }
    throw error;
  }

  let body: Record<string, unknown>;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid_json", message: "invalid JSON body" } }, { status: 422 });
  }

  const eventId = request.headers.get("Idempotency-Key") ?? (typeof body.event_id === "string" ? body.event_id : null);
  const eventType = typeof body.event_type === "string" ? body.event_type : null;
  if (!eventId || !eventType) {
    return NextResponse.json(
      { ok: false, error: { code: "validation_error", message: "event_id(Idempotency-Key)/event_typeが必要です" } },
      { status: 422 }
    );
  }

  const payloadHash = computePayloadHash(rawBody);
  const claim = await claimInboxEvent({
    sourceSystemKey: identity.systemKey,
    eventId,
    eventType,
    payload: body,
    payloadHash,
  });

  // 契約書6.4: 同一event_id+異なるpayload_hashは409、同一event_id+同一payload_hashは
  // 既処理結果(200)を返す。
  if (claim.outcome === "conflict") {
    return NextResponse.json(
      { ok: false, error: { code: "idempotency_conflict", message: "同一event_idで異なる内容のリクエストです" } },
      { status: 409 }
    );
  }
  if (claim.outcome === "duplicate") {
    return NextResponse.json({ ok: true, event_id: eventId, status: "succeeded" });
  }

  const handler = EVENT_HANDLERS[eventType];
  if (!handler) {
    // 未対応のイベント種別は200で受理し処理対象外として無視する
    // (/api/integrations/agenciesと同じ堅牢化方針)。
    await markInboxEventSucceeded(claim.inboxEventId);
    return NextResponse.json({ ok: true, event_id: eventId, status: "succeeded", processed: false });
  }

  try {
    await handler(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await markInboxEventFailed(claim.inboxEventId, message);
    console.error(`[sen-no-kuni-hub] ${eventType}の処理に失敗しました`, error);
    return NextResponse.json({ ok: false, error: { code: "internal_error", message: "internal server error" } }, { status: 500 });
  }

  await markInboxEventSucceeded(claim.inboxEventId);
  return NextResponse.json({ ok: true, event_id: eventId, status: "succeeded" });
}
