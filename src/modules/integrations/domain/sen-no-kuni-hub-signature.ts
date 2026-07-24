import crypto from "node:crypto";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-3(§7)。
// HMAC署名v2のcanonical string構築・バージョン判定・v1許可判定を、DB非依存の
// 純粋関数として抽出する(署名検証本体はsrc/lib/sen-no-kuni-hub-auth.tsに残置)。

export type SenNoKuniHubSignatureVersion = "1" | "2";

// X-SenNoKuni-Signature-Versionヘッダー省略時はv1として扱う(既存接続の後方互換、§7.1)。
// "1"/"2"以外の値は不正な指定として扱い、呼び出し側で401にする。
export function resolveSignatureVersion(header: string | null): SenNoKuniHubSignatureVersion | null {
  if (header === null) return "1";
  if (header === "1" || header === "2") return header;
  return null;
}

// 既存v1署名: HMAC-SHA256(timestamp + "." + raw_body)。
export function buildV1SignedPayload(timestamp: string, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

// v2署名(§7.2): key_id/timestamp/nonce/event_version/idempotency_key/raw_bodyを
// 署名対象に含める。raw_bodyはそのまま連結すると改行等の混入で境界が曖昧になるため、
// 指示書の推奨canonical stringに従いsha256ハッシュ値(hex)を連結する。
export function buildV2CanonicalString(input: {
  keyId: string;
  timestamp: string;
  nonce: string;
  eventVersion: string;
  idempotencyKey: string;
  rawBody: string;
}): string {
  const bodyHash = crypto.createHash("sha256").update(input.rawBody).digest("hex");
  return [input.keyId, input.timestamp, input.nonce, input.eventVersion, input.idempotencyKey, bodyHash].join("\n");
}

// システム単位でv1署名の受け付けを止める日時(§7.3)。未設定(null)なら無期限に許可する。
export function isV1SignatureAllowed(v1DisabledAt: string | null, now: Date): boolean {
  if (!v1DisabledAt) return true;
  return now.getTime() < new Date(v1DisabledAt).getTime();
}
