// 未解放の城について「解放まであとどれくらいか」を言葉にする純粋関数。
//
// 城一覧では未解放の城を「🔒 未解放」と出すだけで、何をすれば開くのかが分からなかった。
// 解放条件は国の制圧(=その国の必須武将を全部集める)か地方の制覇(=その地方の国を
// 全部制圧する)のどちらかなので、残り件数を数えて「あと◯武将」「あと◯国」と示す。
//
// 未解放の城そのものの内容(城名以外の詳細・区画)は引き続き伏せる方針(実装指示書v1.0 6-6)
// を変えていない。ここで示すのは「解放までの距離」だけで、城の中身には触れない。

import type { CastleUnlockLevel } from "@/lib/castle-unlock";

export type CastleUnlockProgress = {
  // 解放条件の呼び名。例: "美濃国の制圧" / "中部地方の制覇"。
  requirementLabel: string;
  // あといくつ満たせば解放されるか。
  remaining: number;
  // remainingの単位。武将=ガチャで集める、国=他の国を制圧する。
  unit: "warlord" | "province";
  // 一覧に出す短い文言。例: "あと3武将で解放"。
  label: string;
  // 進捗バー用。0〜1。分母が0のときは0を返す。
  ratio: number;
};

export type CastleUnlockProgressContext = {
  // 主要国が未設定の城は解放条件を評価できず、isCastleUnlockedが公開扱いに
  // フォールバックする。その場合はそもそも未解放にならないので進捗も出さない。
  provinceName: string | null;
  // 国の制圧に必要な武将の数と、そのうち獲得済みの数。
  requiredWarlordCount: number;
  ownedWarlordCount: number;
  // 地方の呼び名(例: "中部")と、その地方の国の数・制圧済みの数。
  region: string | null;
  regionProvinceCount: number;
  regionConqueredCount: number;
};

function clampRemaining(total: number, done: number): number {
  return Math.max(0, total - done);
}

function ratioOf(total: number, done: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, done / total));
}

// 未解放の城にのみ意味がある。解放済みの城や、進捗を数えられない城ではnullを返す。
export function describeCastleUnlockProgress(
  unlockLevel: CastleUnlockLevel,
  context: CastleUnlockProgressContext
): CastleUnlockProgress | null {
  // 非公開の城は「いつか開く」ものではないので、進捗という概念が無い。
  if (unlockLevel === "PUBLIC" || unlockLevel === "UNPUBLISHED") return null;

  if (unlockLevel === "PROVINCE_CONQUEST_REQUIRED") {
    if (!context.provinceName) return null;
    // 必須武将が1人も設定されていない国は制圧条件を数えられない
    // (getProvinceRequiredWarlordsが空配列を返すのと同じ状況)。
    if (context.requiredWarlordCount <= 0) return null;
    const remaining = clampRemaining(context.requiredWarlordCount, context.ownedWarlordCount);
    return {
      requirementLabel: `${context.provinceName}の制圧`,
      remaining,
      unit: "warlord",
      label: remaining > 0 ? `あと${remaining}武将で解放` : "まもなく解放",
      ratio: ratioOf(context.requiredWarlordCount, context.ownedWarlordCount),
    };
  }

  // REGION_CONQUEST_REQUIRED
  if (!context.region || context.regionProvinceCount <= 0) return null;
  const remaining = clampRemaining(context.regionProvinceCount, context.regionConqueredCount);
  return {
    requirementLabel: `${context.region}地方の制覇`,
    remaining,
    unit: "province",
    label: remaining > 0 ? `あと${remaining}国で解放` : "まもなく解放",
    ratio: ratioOf(context.regionProvinceCount, context.regionConqueredCount),
  };
}

// 解放された瞬間にLINEで送る本文。通知は取り消せないので、城名以外の情報は載せない。
export function buildCastleUnlockedMessage(castleName: string, requirementLabel: string): string {
  return `【戦国パスポート】${requirementLabel}により「${castleName}」が解放されました。アプリから城の詳細と販売中の区画をご覧いただけます。`;
}
