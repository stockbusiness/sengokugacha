import crypto from "node:crypto";
import { buildV1SignedPayload, buildV2CanonicalString } from "@/modules/integrations/domain/sen-no-kuni-hub-signature";

// 千ノ国パスポート Phase C-0(§10 HMACテスト)。supabase/seed.sqlが投入する
// sen_no_kuni_hub_settings('test-key-id')に対応する署名を生成する。

export const TEST_HMAC_KEY_ID = "test-key-id";
export const TEST_HMAC_SECRET = "test-hmac-secret-do-not-use-in-production";

export function signV1(timestamp: string, rawBody: string): string {
  return crypto.createHmac("sha256", TEST_HMAC_SECRET).update(buildV1SignedPayload(timestamp, rawBody)).digest("hex");
}

export function signV2(params: {
  timestamp: string;
  nonce: string;
  eventVersion: string;
  idempotencyKey: string;
  rawBody: string;
}): string {
  const canonical = buildV2CanonicalString({ keyId: TEST_HMAC_KEY_ID, ...params });
  return crypto.createHmac("sha256", TEST_HMAC_SECRET).update(canonical).digest("hex");
}
