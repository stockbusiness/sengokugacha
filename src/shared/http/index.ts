import { ExternalServiceError } from "@/shared/errors";
import type { AppLogger } from "@/shared/observability";

// 千ノ国パスポート モジュール化・保守性改善指示書 §6。
// LINE Verify API、sengoku-ai.com、JWKS、将来のHMAC送信等、外部通信のタイムアウト・
// エラー変換・ログを統一する薄いラッパー。既存のfail-open方針(失敗しても主処理を
// 継続する)は呼び出し側(各infrastructureクライアント)の責務のまま変更しない。
export type FetchWithTimeoutOptions = {
  timeoutMs?: number;
  logger?: AppLogger;
};

const DEFAULT_TIMEOUT_MS = 5000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    options.logger?.warn(`外部通信に失敗しました: ${url}`, { error: message });
    throw new ExternalServiceError(`外部通信に失敗しました: ${url}`);
  }
}
