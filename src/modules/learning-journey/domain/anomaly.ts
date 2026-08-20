// 不正疑いの検知。DB非依存の純粋関数だけを置く。
//
// 指示書§11「不正疑いは初期版では検知・一覧表示に限定し、自動遮断しない。
// 短時間の連続完了、同一端末・同一ネットワークからの複数アカウント、同一回答パターン等を
// 複合的な警告材料とし、単一条件で不正と断定しない」。
//
// したがってこの関数は「疑い」を返すだけで、真偽の判定はしない。呼び出し側も
// これを理由に付与を止めたり、アカウントを停止したりしてはならない。
//
// IPアドレス・端末情報は現時点では収集していない(指示書§11「必要性、保存期間、
// アクセス権を定め、可能な限りハッシュ化または短期保存とする」を満たす設計が
// 決まっていないため)。そのため、いま判定できるのは完了の時間間隔と回答の一致だけ。

export type CompletionRecord = {
  missionId: string;
  completedAt: string;
};

export type AnomalySignal =
  // 短時間に多くのミッションを完了した(教材を読まずに送信した可能性)。
  | { kind: "rapid_completion"; completedCount: number; withinMinutes: number }
  // 自由記述がすべて同一(使い回しの可能性)。
  | { kind: "identical_free_text"; occurrences: number };

export type AnomalyThresholds = {
  // この分数の中に、この件数以上の完了があれば疑いとする。
  rapidWindowMinutes: number;
  rapidCompletionCount: number;
  // 同じ自由記述がこの件数以上あれば疑いとする。
  identicalFreeTextCount: number;
};

export const DEFAULT_ANOMALY_THRESHOLDS: AnomalyThresholds = {
  rapidWindowMinutes: 5,
  rapidCompletionCount: 3,
  identicalFreeTextCount: 3,
};

// 連続する完了の中で、指定時間内に何件入るかの最大値を求める。
function maxCompletionsInWindow(completions: CompletionRecord[], windowMinutes: number): number {
  if (completions.length === 0) return 0;

  const times = completions
    .map((completion) => new Date(completion.completedAt).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b);
  if (times.length === 0) return 0;

  const windowMs = windowMinutes * 60 * 1000;
  let best = 1;
  let start = 0;
  for (let end = 0; end < times.length; end += 1) {
    while (times[end] - times[start] > windowMs) start += 1;
    best = Math.max(best, end - start + 1);
  }
  return best;
}

function maxIdenticalCount(freeTexts: string[]): number {
  const counts = new Map<string, number>();
  for (const raw of freeTexts) {
    const text = raw.trim();
    // 空欄は「使い回し」ではないので数えない。
    if (text.length === 0) continue;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  let best = 0;
  for (const count of counts.values()) best = Math.max(best, count);
  return best;
}

export function detectAnomalies(
  input: { completions: CompletionRecord[]; freeTexts: string[] },
  thresholds: AnomalyThresholds = DEFAULT_ANOMALY_THRESHOLDS
): AnomalySignal[] {
  const signals: AnomalySignal[] = [];

  const rapid = maxCompletionsInWindow(input.completions, thresholds.rapidWindowMinutes);
  if (rapid >= thresholds.rapidCompletionCount) {
    signals.push({ kind: "rapid_completion", completedCount: rapid, withinMinutes: thresholds.rapidWindowMinutes });
  }

  const identical = maxIdenticalCount(input.freeTexts);
  if (identical >= thresholds.identicalFreeTextCount) {
    signals.push({ kind: "identical_free_text", occurrences: identical });
  }

  return signals;
}

// 管理画面に出す文言。「不正」と断定せず、確認を促す表現にする。
export function describeAnomaly(signal: AnomalySignal): string {
  switch (signal.kind) {
    case "rapid_completion":
      return `${signal.withinMinutes}分間に${signal.completedCount}件完了（要確認）`;
    case "identical_free_text":
      return `同じ自由記述が${signal.occurrences}件（要確認）`;
  }
}
