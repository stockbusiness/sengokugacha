import crypto from "node:crypto";

// 千ノ国パスポート Phase C-0 PR4(§9 HMAC v1/v2統合テスト)。
// verify-sen-no-kuni-hub-request.tsの署名検証ロジックと対になる、テスト側の署名生成
// ヘルパー。実際にHTTP経由でPOST /api/integrations/sen-no-kuni-hubへ送るリクエストの
// ヘッダーをここで組み立てる(本番コードの実装を読んで独立に再実装したものであり、
// 本番側のバグがあってもテスト側では検出できてしまう箇所が無いよう、
// buildV1SignedPayload/buildV2CanonicalStringとは別に生の文字列連結で計算する)。

export function signV1(params: {
  keyId: string;
  secret: string;
  rawBody: string;
  timestamp?: string;
  nonce?: string;
}): Record<string, string> {
  const timestamp = params.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = params.nonce ?? crypto.randomUUID();
  const signature = crypto
    .createHmac("sha256", params.secret)
    .update(`${timestamp}.${params.rawBody}`)
    .digest("hex");
  return {
    "X-SenNoKuni-Key-Id": params.keyId,
    "X-SenNoKuni-Timestamp": timestamp,
    "X-SenNoKuni-Nonce": nonce,
    "X-SenNoKuni-Signature": signature,
  };
}

export function signV2(params: {
  keyId: string;
  secret: string;
  rawBody: string;
  eventVersion: string;
  idempotencyKey: string;
  timestamp?: string;
  nonce?: string;
}): Record<string, string> {
  const timestamp = params.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = params.nonce ?? crypto.randomUUID();
  const bodyHash = crypto.createHash("sha256").update(params.rawBody).digest("hex");
  const canonical = [params.keyId, timestamp, nonce, params.eventVersion, params.idempotencyKey, bodyHash].join("\n");
  const signature = crypto.createHmac("sha256", params.secret).update(canonical).digest("hex");
  return {
    "X-SenNoKuni-Key-Id": params.keyId,
    "X-SenNoKuni-Timestamp": timestamp,
    "X-SenNoKuni-Nonce": nonce,
    "X-SenNoKuni-Signature": signature,
    "X-SenNoKuni-Signature-Version": "2",
    "X-Event-Version": params.eventVersion,
    "Idempotency-Key": params.idempotencyKey,
  };
}
