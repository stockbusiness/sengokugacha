// 千ノ国パスポート モジュール化・保守性改善指示書 §6・§10。
// secretや個人情報(LINE user ID、メール、電話、トークン等)を無条件に出力しない
// ロガー。SEN_NO_KUNI_PASSPORT_MODULARIZATION_INSTRUCTIONSの共通契約セキュリティ要件
// (raw token・API key・JWT・LINE user ID・メール・電話をログへ平文出力しない)にも対応する。
export interface AppLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const REDACTED = "[redacted]";
const SENSITIVE_KEY_PATTERNS = [
  "password",
  "secret",
  "token",
  "api_key",
  "apikey",
  "authorization",
  "cookie",
  "line_user_id",
  "lineuserid",
  "email",
  "phone",
  "signature",
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

// contextのトップレベルキーのうち、secret・個人情報らしきキー名を機械的に伏せる純粋関数。
// ネストしたオブジェクトの中身までは検査しない(呼び出し側が渡す値そのものを対象とする
// 簡易な防御層であり、完全な機密情報検出を保証するものではない)。
export function sanitizeLogContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return context;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    sanitized[key] = isSensitiveKey(key) ? REDACTED : value;
  }
  return sanitized;
}

export const consoleLogger: AppLogger = {
  info: (message, context) => console.info(message, sanitizeLogContext(context) ?? ""),
  warn: (message, context) => console.warn(message, sanitizeLogContext(context) ?? ""),
  error: (message, context) => console.error(message, sanitizeLogContext(context) ?? ""),
};
