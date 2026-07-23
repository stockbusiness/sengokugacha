// 千ノ国パスポート モジュール化・保守性改善指示書 §13。
// 共通エラー型。domain/application層はNext.jsのNextResponseを直接組み立てず、
// これらのエラーをthrowし、presentation層(Route Handler)でtoHttpStatus()を使って
// HTTPレスポンスへ変換する。

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export class ExternalServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalServiceError";
  }
}

export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}

export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseError";
  }
}

const ERROR_HTTP_STATUS: Record<string, number> = {
  ValidationError: 422,
  AuthenticationError: 401,
  AuthorizationError: 403,
  NotFoundError: 404,
  ConflictError: 409,
  IdempotencyConflictError: 409,
  ExternalServiceError: 502,
  DatabaseError: 500,
};

// 未分類のエラー(通常のErrorやSupabaseの生エラー等)は500として扱う。
export function toHttpStatus(error: unknown): number {
  if (error instanceof Error && error.name in ERROR_HTTP_STATUS) {
    return ERROR_HTTP_STATUS[error.name];
  }
  return 500;
}
