// 千ノ国パスポート モジュール化・保守性改善指示書 Phase 5(§8・§15 PR11、integrations)。
// src/app/api/integrations/sen-no-kuni-hub/route.tsに埋め込まれていた
// event envelope検証ロジック(DB非依存部分)を抽出。00_COMMON_INTEGRATION_CONTRACT.md
// 6章・千ノ国パスポート次期改修指示書 P0-2(バグ#6・#7)に対応する。

// P0-2(バグ#7)。現時点で本エンドポイントは実接続前のため"1.0"のみをサポートする。
// 送信元が新しいスキーマ版を使い始める場合は、このリストに追加してから互換性を確認する。
export const SUPPORTED_EVENT_VERSIONS = ["1.0"];

export function isSupportedEventVersion(eventVersion: string): boolean {
  return SUPPORTED_EVENT_VERSIONS.includes(eventVersion);
}

export type ResolveEventIdResult =
  | { ok: true; eventId: string }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "mismatch" };

// P0-2(バグ#7)。Idempotency-Keyヘッダーとbody.event_idが両方存在する場合、送信元の
// 実装不備(片方だけ更新し忘れた等)を早期検知するため一致を要求する。
export function resolveEventId(params: {
  idempotencyKeyHeader: string | null;
  bodyEventId: string | null;
}): ResolveEventIdResult {
  const { idempotencyKeyHeader, bodyEventId } = params;
  if (idempotencyKeyHeader && bodyEventId && idempotencyKeyHeader !== bodyEventId) {
    return { ok: false, reason: "mismatch" };
  }
  const eventId = idempotencyKeyHeader ?? bodyEventId;
  if (!eventId) return { ok: false, reason: "missing" };
  return { ok: true, eventId };
}

// body.source_system_keyを送信元が含めている場合、HMAC認証済みのidentity.systemKeyと
// 一致しないなら送信元の設定不備の可能性が高いため早期に拒否する(§6.2の延長)。
// body側が省略されている(null)場合は常に整合とみなす。
export function isSourceSystemKeyConsistent(bodySourceSystemKey: string | null, identitySystemKey: string): boolean {
  if (!bodySourceSystemKey) return true;
  return bodySourceSystemKey === identitySystemKey;
}
