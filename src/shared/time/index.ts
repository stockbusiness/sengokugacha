// 千ノ国パスポート モジュール化・保守性改善指示書 §6。
// 日次ガチャ上限、ログイン日、Webhook日時、権利付与日時等で「現在時刻」を直接
// `new Date()`で取得する代わりにClockを注入できるようにする(テスト容易性のため)。
export interface Clock {
  now(): Date;
  today(timezone: string): string;
}

// タイムゾーンを考慮したYYYY-MM-DD文字列を返す純粋関数。日次ガチャ上限判定
// (REFERENCE_SYSTEM_INTEGRATION_ANALYSISで指摘されていたサーバーローカル時刻依存の
// 問題)を、Clock経由で明示的なタイムゾーン指定に置き換えられるようにする。
export function formatDateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export const systemClock: Clock = {
  now: () => new Date(),
  today: (timezone: string) => formatDateInTimezone(new Date(), timezone),
};
