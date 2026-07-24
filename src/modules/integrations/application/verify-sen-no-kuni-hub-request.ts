import crypto from "node:crypto";
import {
  buildV1SignedPayload,
  buildV2CanonicalString,
  isV1SignatureAllowed,
  resolveSignatureVersion,
} from "@/modules/integrations/domain/sen-no-kuni-hub-signature";
import type { SenNoKuniHubSettingsRepository } from "@/modules/integrations/application/ports";

// 千ノ国パスポート 全体統合対応 実装計画(PR5)。
// 00_COMMON_INTEGRATION_CONTRACT.md 6.1/8章のHMAC署名検証。既存のsengoku-ai.com連携
// (APIキー認証)とは完全に独立した、権利付与API・購入/返信イベント受信専用の認証基盤。

const MAX_CLOCK_SKEW_SECONDS = 5 * 60; // 契約書8章「許容時間差は原則5分以内」

export type SenNoKuniHubAuthErrorCode =
  | "missing_headers"
  | "unknown_key"
  | "disabled"
  | "invalid_timestamp"
  | "invalid_signature"
  | "invalid_signature_version"
  | "v1_disabled"
  | "replayed_nonce";

export class SenNoKuniHubAuthError extends Error {
  code: SenNoKuniHubAuthErrorCode;
  constructor(code: SenNoKuniHubAuthErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type SenNoKuniHubIdentity = { systemKey: string; signatureVersion: "1" | "2" };

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase A-3(§7)。
// v1署名: HMAC-SHA256(timestamp + "." + raw_body)。
// v2署名: HMAC-SHA256(key_id/timestamp/nonce/event_version/idempotency_key/raw_bodyの
// canonical string)。X-SenNoKuni-Signature-Versionヘッダーで判別し、省略時はv1として
// 扱う(既存接続を破壊しない、§7.1)。
//
// 検証順序: ヘッダー存在確認 → 鍵解決 → v1停止判定 → timestamp範囲確認 → 署名検証 →
// nonceワンタイム確認。署名検証を先に行うことで、秘密鍵を持たない第三者がnonce使用状況を
// 探れないようにする(agency-sso.tsのJWT検証→jti確認という既存順序と同じ考え方)。
//
// Phase B-1: 呼び出し元(src/lib/sen-no-kuni-hub-auth.ts)がNextRequestからヘッダーを
// 抽出して渡す形にすることで、application層はNext.jsに依存しない。
export async function verifySenNoKuniHubIdentity(
  repository: SenNoKuniHubSettingsRepository,
  headers: {
    keyId: string | null;
    timestamp: string | null;
    nonce: string | null;
    signature: string | null;
    signatureVersionHeader: string | null;
    eventVersionHeader: string | null;
    idempotencyKeyHeader: string | null;
  },
  rawBody: string
): Promise<SenNoKuniHubIdentity> {
  const { keyId, timestamp, nonce, signature } = headers;
  if (!keyId || !timestamp || !nonce || !signature) {
    throw new SenNoKuniHubAuthError("missing_headers", "必須ヘッダー(Key-Id/Timestamp/Nonce/Signature)が不足しています");
  }

  const signatureVersion = resolveSignatureVersion(headers.signatureVersionHeader);
  if (!signatureVersion) {
    throw new SenNoKuniHubAuthError("invalid_signature_version", "サポートされていないX-SenNoKuni-Signature-Versionです");
  }

  let eventVersion: string | null = null;
  let idempotencyKey: string | null = null;
  if (signatureVersion === "2") {
    eventVersion = headers.eventVersionHeader;
    idempotencyKey = headers.idempotencyKeyHeader;
    if (!eventVersion || !idempotencyKey) {
      throw new SenNoKuniHubAuthError("missing_headers", "v2署名にはX-Event-Version/Idempotency-Keyヘッダーが必要です");
    }
  }

  const settings = await repository.findByKeyId(keyId);
  if (!settings) throw new SenNoKuniHubAuthError("unknown_key", "未登録のkey_idです");
  if (!settings.enabled) throw new SenNoKuniHubAuthError("disabled", "この連携は無効化されています");

  if (signatureVersion === "1" && !isV1SignatureAllowed(settings.v1_disabled_at, new Date())) {
    throw new SenNoKuniHubAuthError("v1_disabled", "この連携ではv1署名の受付を終了しています。v2署名を使用してください");
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    throw new SenNoKuniHubAuthError("invalid_timestamp", "timestampの形式が不正です");
  }
  const nowSeconds = Date.now() / 1000;
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) {
    throw new SenNoKuniHubAuthError("invalid_timestamp", "timestampが許容範囲(5分)外です");
  }

  const signedPayload =
    signatureVersion === "2"
      ? buildV2CanonicalString({
          keyId,
          timestamp,
          nonce,
          eventVersion: eventVersion as string,
          idempotencyKey: idempotencyKey as string,
          rawBody,
        })
      : buildV1SignedPayload(timestamp, rawBody);
  const expectedSignature = crypto.createHmac("sha256", settings.hmac_secret).update(signedPayload).digest("hex");

  const providedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new SenNoKuniHubAuthError("invalid_signature", "署名が一致しません");
  }

  // nonceのワンタイム利用チェック(unique制約違反=リプレイ)。v1/v2共通のnonce空間を使う。
  const nonceIsUnused = await repository.insertNonceIfUnused(keyId, nonce);
  if (!nonceIsUnused) throw new SenNoKuniHubAuthError("replayed_nonce", "このnonceは既に使用されています");

  // v1利用ログ(§7.3「v1利用ログを記録」)。v1停止時期の判断材料とするための記録であり、
  // 認証結果そのものには影響しないためベストエフォートで行う。
  if (signatureVersion === "1") {
    await repository.recordV1Usage(keyId);
  }

  return { systemKey: settings.system_key, signatureVersion };
}
