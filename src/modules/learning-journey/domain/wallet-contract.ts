// 「はじまりの旅」PR5-a。Wallet送信の契約型とエラー分類。
//
// このファイルはHTTPを一切知らない。PR5-bでHTTPアダプタを書くとき、ここの型と
// 分類規則をそのまま使えるようにしておく。

// 利用者の指定方法。
//
// 2026-08-22のご指示により service_code + external_user_id で確定。
// common_user_id は付与APIでは使わないため、それを送る型は作らない。
// (作れてしまうと「型があるから使ってよい」と読めてしまう)
export type WalletUserRef = {
  kind: "external_user_id";
  serviceCode: string;
  externalUserId: string;
};

export type WalletGrantRequest = {
  // ボディのフィールドとして送る(ヘッダーではない)。ADR-8。
  idempotencyKey: string;
  user: WalletUserRef;
  amount: number;
  // 学習ミッション専用の取引種別・ルールコード。値はWallet側の正式回答待ち。
  transactionType: string;
  ruleCode: string;
};

export type WalletReverseRequest = {
  idempotencyKey: string;
  // 取り消す対象。付与時にWalletが返した取引ID。
  originalTransactionId: string;
  reason: string;
};

// エラー分類(指示書§5.4)。再試行してよいかどうかを、呼び出し側がここだけで判断できる。
export type WalletErrorKind =
  // 429 / 5xx / timeout。ジッター付き指数バックオフで再試行。
  | "transient"
  // 400 / 404 / 409。契約不整合。人手確認が要る。自動再試行しない。
  | "permanent"
  // 401 / 403。認証・権限。自動再試行を止め、緊急通知の対象。
  | "auth"
  // Wallet所定コード。LIMIT_HELD または管理者確認へ。
  | "limit";

export type WalletFailure = {
  kind: WalletErrorKind;
  code: string;
  message: string;
  // Wallet側のログと突き合わせるためのID。取れない場合はnull。
  requestId: string | null;
};

export type WalletGrantResult =
  | { ok: true; transactionId: string; requestId: string | null }
  | { ok: false; failure: WalletFailure };

export type WalletReverseResult =
  | { ok: true; reversalTransactionId: string; requestId: string | null }
  | { ok: false; failure: WalletFailure };

export interface WalletAdapter {
  grant(request: WalletGrantRequest): Promise<WalletGrantResult>;
  reverse(request: WalletReverseRequest): Promise<WalletReverseResult>;
}

// HTTPステータス → エラー分類。指示書§5.4の表をそのまま写したもの。
//
// PR5-bでHTTPアダプタを書くときにここを再実装しないで済むよう、先に確定させておく。
// Wallet固有の上限コードはステータスから判別できないため、呼び出し側が
// classifyWalletError() へ渡す前に判定する。
export function classifyHttpStatus(status: number): WalletErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "transient";
  if (status >= 500) return "transient";
  // 400 / 404 / 409 を含む 4xx。契約不整合。
  if (status >= 400) return "permanent";
  // 2xx / 3xx をここへ渡すのは呼び出し側の誤り。再試行で解決しないので permanent。
  return "permanent";
}

// 再試行してよいか。
export function isRetryable(kind: WalletErrorKind): boolean {
  return kind === "transient";
}

// 指数バックオフ + ジッター(指示書§5.4)。
//
// ジッターを入れるのは、同時に失敗した複数の要求が同じ時刻に再試行して
// Wallet側へ波を作らないようにするため。
export function computeRetryDelaySeconds(
  attemptCount: number,
  random: () => number = Math.random
): number {
  const base = Math.min(2 ** Math.max(0, attemptCount), 3600);
  const jitter = base * 0.25 * random();
  return Math.round(base + jitter);
}
