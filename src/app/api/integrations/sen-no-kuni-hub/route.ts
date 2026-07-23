import { NextRequest, NextResponse } from "next/server";
import { SenNoKuniHubAuthError, verifySenNoKuniHubRequest } from "@/lib/sen-no-kuni-hub-auth";
import { claimInboxEvent, computePayloadHash, markInboxEventFailed, markInboxEventSucceeded } from "@/lib/integration-inbox";
import { handleEntitlementGranted, handleEntitlementRevoked, handleEntitlementUpdated } from "@/lib/entitlements";
import { handleAssignedAgentUpdated } from "@/lib/agency-events";
import { recordShoppingOrderEvent } from "@/lib/shopping-order-events";
import { isSourceSystemKeyConsistent, isSupportedEventVersion, resolveEventId } from "@/modules/integrations/domain/event-envelope";

// 千ノ国パスポート 全体統合対応 実装計画(PR6/PR7)。00_COMMON_INTEGRATION_CONTRACT.md
// 6章に準拠した新規HMAC連携の受信エンドポイント。既存の/api/integrations/agencies
// (APIキー認証、sengoku-ai.com専用)とは別パスであり、認証方式・処理内容ともに独立している。
const EVENT_HANDLERS: Record<
  string,
  (body: Record<string, unknown>, eventId: string, systemKey: string, eventVersion: string) => Promise<void>
> = {
  // P0-2(§6.2): entitlementsのentitlement_idはsource_system_key単位で一意なため、
  // 未検証のbody.source_system_keyではなくHMAC認証済みのidentity.systemKeyを渡す(バグ#6)。
  "entitlement.granted": (body, _eventId, systemKey) => handleEntitlementGranted(body, systemKey),
  "entitlement.updated": (body, _eventId, systemKey) => handleEntitlementUpdated(body, systemKey),
  "entitlement.revoked": (body, _eventId, systemKey) => handleEntitlementRevoked(body, systemKey),
  // common_user.assigned_agent.updated(旧チャネル、PR4)と同じ内部関数を共有する。
  "customer.assignment.changed": (body) => handleAssignedAgentUpdated(body),
  // 購入・決済・返金イベント(PR7)。商品カタログ・注文ID体系が未確定のため、
  // 当面は監査目的の記録のみ(shopping_order_events)。P0-2(§6.1)でsource_system_key/
  // event_versionも記録するよう変更。
  "order.created": (body, eventId, systemKey, eventVersion) =>
    recordShoppingOrderEvent(eventId, "order.created", body, systemKey, eventVersion),
  "order.paid": (body, eventId, systemKey, eventVersion) =>
    recordShoppingOrderEvent(eventId, "order.paid", body, systemKey, eventVersion),
  "order.cancelled": (body, eventId, systemKey, eventVersion) =>
    recordShoppingOrderEvent(eventId, "order.cancelled", body, systemKey, eventVersion),
  "payment.succeeded": (body, eventId, systemKey, eventVersion) =>
    recordShoppingOrderEvent(eventId, "payment.succeeded", body, systemKey, eventVersion),
  "payment.failed": (body, eventId, systemKey, eventVersion) =>
    recordShoppingOrderEvent(eventId, "payment.failed", body, systemKey, eventVersion),
  "payment.refunded": (body, eventId, systemKey, eventVersion) =>
    recordShoppingOrderEvent(eventId, "payment.refunded", body, systemKey, eventVersion),
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

  // P0-2(バグ#7)。event_versionはHMAC署名の対象外(タイムスタンプ+本文のみが署名対象)
  // のため機密性は無いが、送信元が認識しているスキーマ版を明示させることで、未対応の
  // 破壊的変更を暗黙のうちに処理してしまうことを防ぐ。
  const eventVersion = request.headers.get("X-Event-Version");
  if (!eventVersion) {
    return NextResponse.json(
      { ok: false, error: { code: "validation_error", message: "X-Event-Versionヘッダーが必要です" } },
      { status: 422 }
    );
  }
  if (!isSupportedEventVersion(eventVersion)) {
    return NextResponse.json(
      { ok: false, error: { code: "unsupported_event_version", message: `サポートされていないevent_versionです: ${eventVersion}` } },
      { status: 422 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ ok: false, error: { code: "invalid_json", message: "invalid JSON body" } }, { status: 422 });
  }

  const idempotencyKeyHeader = request.headers.get("Idempotency-Key");
  const bodyEventId = typeof body.event_id === "string" ? body.event_id : null;
  const eventIdResolution = resolveEventId({ idempotencyKeyHeader, bodyEventId });
  if (!eventIdResolution.ok && eventIdResolution.reason === "mismatch") {
    return NextResponse.json(
      { ok: false, error: { code: "event_id_mismatch", message: "Idempotency-Keyヘッダーとbody.event_idが一致しません" } },
      { status: 422 }
    );
  }

  const eventType = typeof body.event_type === "string" ? body.event_type : null;
  if (!eventIdResolution.ok || !eventType) {
    return NextResponse.json(
      { ok: false, error: { code: "validation_error", message: "event_id(Idempotency-Key)/event_typeが必要です" } },
      { status: 422 }
    );
  }
  const eventId = eventIdResolution.eventId;

  const bodySourceSystemKey = typeof body.source_system_key === "string" ? body.source_system_key : null;
  if (!isSourceSystemKeyConsistent(bodySourceSystemKey, identity.systemKey)) {
    return NextResponse.json(
      { ok: false, error: { code: "source_system_mismatch", message: "body.source_system_keyが認証情報と一致しません" } },
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
    eventVersion,
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
  // P0-2(§4.5): 同一event_idを別リクエストが現在処理中(claim_integration_inbox_eventが
  // 原子的に検知)。並行実行によるハンドラの二重実行を避けるため、今回は処理せず送信元の
  // 再送に委ねる。
  if (claim.outcome === "in_progress") {
    return NextResponse.json(
      { ok: false, error: { code: "event_in_progress", message: "同一イベントを処理中です。しばらくしてから再送してください" } },
      { status: 409 }
    );
  }
  if (claim.outcome === "dead") {
    return NextResponse.json(
      { ok: false, error: { code: "event_dead", message: "このイベントは再試行の上限に達しています。管理画面で確認してください" } },
      { status: 409 }
    );
  }

  const handler = EVENT_HANDLERS[eventType];
  if (!handler) {
    // 未対応のイベント種別は200で受理し処理対象外として無視する
    // (/api/integrations/agenciesと同じ堅牢化方針)。
    await markInboxEventSucceeded(claim.inboxEventId);
    return NextResponse.json({ ok: true, event_id: eventId, status: "succeeded", processed: false });
  }

  try {
    await handler(body, eventId, identity.systemKey, eventVersion);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await markInboxEventFailed(claim.inboxEventId, message);
    console.error(`[sen-no-kuni-hub] ${eventType}の処理に失敗しました`, error);
    return NextResponse.json({ ok: false, error: { code: "internal_error", message: "internal server error" } }, { status: 500 });
  }

  await markInboxEventSucceeded(claim.inboxEventId);
  return NextResponse.json({ ok: true, event_id: eventId, status: "succeeded" });
}
