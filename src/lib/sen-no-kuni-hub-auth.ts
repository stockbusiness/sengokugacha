import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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
  | "replayed_nonce";

export class SenNoKuniHubAuthError extends Error {
  code: SenNoKuniHubAuthErrorCode;
  constructor(code: SenNoKuniHubAuthErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type SenNoKuniHubIdentity = { systemKey: string };

// X-SenNoKuni-Signature: HMAC-SHA256(timestamp + "." + raw_body)
// 検証順序: ヘッダー存在確認 → 鍵解決 → timestamp範囲確認 → 署名検証 → nonceワンタイム確認。
// 署名検証を先に行うことで、秘密鍵を持たない第三者がnonce使用状況を探れないようにする
// (agency-sso.tsのJWT検証→jti確認という既存順序と同じ考え方)。
export async function verifySenNoKuniHubRequest(request: NextRequest, rawBody: string): Promise<SenNoKuniHubIdentity> {
  const keyId = request.headers.get("X-SenNoKuni-Key-Id");
  const timestamp = request.headers.get("X-SenNoKuni-Timestamp");
  const nonce = request.headers.get("X-SenNoKuni-Nonce");
  const signature = request.headers.get("X-SenNoKuni-Signature");
  if (!keyId || !timestamp || !nonce || !signature) {
    throw new SenNoKuniHubAuthError("missing_headers", "必須ヘッダー(Key-Id/Timestamp/Nonce/Signature)が不足しています");
  }

  const supabase = createSupabaseServerClient();
  const { data: settings, error } = await supabase
    .from("sen_no_kuni_hub_settings")
    .select("system_key, hmac_secret, enabled")
    .eq("key_id", keyId)
    .maybeSingle();
  if (error) throw error;
  if (!settings) throw new SenNoKuniHubAuthError("unknown_key", "未登録のkey_idです");
  if (!settings.enabled) throw new SenNoKuniHubAuthError("disabled", "この連携は無効化されています");

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    throw new SenNoKuniHubAuthError("invalid_timestamp", "timestampの形式が不正です");
  }
  const nowSeconds = Date.now() / 1000;
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) {
    throw new SenNoKuniHubAuthError("invalid_timestamp", "timestampが許容範囲(5分)外です");
  }

  const expectedSignature = crypto.createHmac("sha256", settings.hmac_secret).update(`${timestamp}.${rawBody}`).digest("hex");

  const providedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new SenNoKuniHubAuthError("invalid_signature", "署名が一致しません");
  }

  // nonceのワンタイム利用チェック(unique制約違反=リプレイ)。
  const { error: nonceError } = await supabase.from("sen_no_kuni_hub_used_nonces").insert({ key_id: keyId, nonce });
  if (nonceError) {
    if (nonceError.code === "23505") throw new SenNoKuniHubAuthError("replayed_nonce", "このnonceは既に使用されています");
    throw nonceError;
  }

  return { systemKey: settings.system_key };
}
