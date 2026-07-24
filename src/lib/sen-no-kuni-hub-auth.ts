import { NextRequest } from "next/server";
import { SupabaseSenNoKuniHubSettingsRepository } from "@/modules/integrations/infrastructure/supabase-sen-no-kuni-hub-settings-repository";
import {
  verifySenNoKuniHubIdentity,
  SenNoKuniHubAuthError,
  type SenNoKuniHubAuthErrorCode,
  type SenNoKuniHubIdentity,
} from "@/modules/integrations/application/verify-sen-no-kuni-hub-request";

// 千ノ国パスポート モジュール化後バグ修正・Phase B改修指示書 Phase B-1(integrationsモジュール)。
// 検証ロジック本体はsrc/modules/integrations/application/verify-sen-no-kuni-hub-request.tsへ
// 移設した(application層はNextRequestに依存しないよう、本ファイルがヘッダーを抽出して渡す)。
// 既存のimport経路(@/lib/sen-no-kuni-hub-auth)を変更せずに使い続けられるよう、本ファイルは
// 薄い互換ラッパーとして残す。

export { SenNoKuniHubAuthError, type SenNoKuniHubAuthErrorCode, type SenNoKuniHubIdentity };

export async function verifySenNoKuniHubRequest(request: NextRequest, rawBody: string): Promise<SenNoKuniHubIdentity> {
  return verifySenNoKuniHubIdentity(
    new SupabaseSenNoKuniHubSettingsRepository(),
    {
      keyId: request.headers.get("X-SenNoKuni-Key-Id"),
      timestamp: request.headers.get("X-SenNoKuni-Timestamp"),
      nonce: request.headers.get("X-SenNoKuni-Nonce"),
      signature: request.headers.get("X-SenNoKuni-Signature"),
      signatureVersionHeader: request.headers.get("X-SenNoKuni-Signature-Version"),
      eventVersionHeader: request.headers.get("X-Event-Version"),
      idempotencyKeyHeader: request.headers.get("Idempotency-Key"),
    },
    rawBody
  );
}
