// 千ノ国パスポート 区画販売のビジュアル強化。
// 区画一覧・区画詳細で共通して使う「見せ方」の判断(状態バッジの色・希少性サマリ・
// 街区グルーピング)を、DB非依存の純粋関数として切り出す。
// 販売導線(予約・決済)には一切触れない。要件書0.1の法務確定前のため、
// 表示の改善のみを行い購入ボタンは追加しない(docs/V2_IMPLEMENTATION_NOTES.md参照)。

export type PlotStatus =
  | "available"
  | "reserved"
  | "application_pending"
  | "payment_pending"
  | "sold"
  | "cancelled"
  | "suspended";

export type PlotStatusTone = "available" | "pending" | "sold" | "inactive";

export type PlotStatusPresentation = {
  label: string;
  tone: PlotStatusTone;
  /** 一覧でカード全体を減光するか(販売機会が無い区画を目立たせない) */
  dimmed: boolean;
};

const PRESENTATIONS: Record<PlotStatus, PlotStatusPresentation> = {
  available: { label: "販売中", tone: "available", dimmed: false },
  reserved: { label: "予約中", tone: "pending", dimmed: false },
  application_pending: { label: "申込審査中", tone: "pending", dimmed: false },
  payment_pending: { label: "入金待ち", tone: "pending", dimmed: false },
  sold: { label: "販売済み", tone: "sold", dimmed: true },
  cancelled: { label: "取消", tone: "inactive", dimmed: true },
  suspended: { label: "一時停止", tone: "inactive", dimmed: true },
};

// 未知のstatusでも表示が壊れないようフォールバックする(DB側にcheck制約はあるが、
// 将来statusが追加された際に画面が空白になるのを避ける)。
export function getPlotStatusPresentation(status: string): PlotStatusPresentation {
  return PRESENTATIONS[status as PlotStatus] ?? { label: status, tone: "inactive", dimmed: true };
}

export type PlotLike = { price_yen: number; status: string };

export type PlotScarcitySummary = {
  total: number;
  availableCount: number;
  soldCount: number;
  pendingCount: number;
  /** 販売中区画の最低価格。販売中が無ければnull */
  minAvailablePriceYen: number | null;
  /** 売却済みの割合(0〜100の整数)。進捗バー表示に使う */
  soldPercent: number;
  /** 残り僅か(販売中が全体の20%以下、かつ1件以上)。希少性の訴求に使う */
  isLowStock: boolean;
};

// 取消・一時停止は「販売枠」として数えない(運用上の一時的な除外であり、
// これを分母に含めると残数の割合が実態とずれるため)。
function isCountedAsInventory(status: string): boolean {
  return status !== "cancelled" && status !== "suspended";
}

export function summarizePlotScarcity(plots: PlotLike[]): PlotScarcitySummary {
  const inventory = plots.filter((plot) => isCountedAsInventory(plot.status));
  const total = inventory.length;

  const availablePlots = inventory.filter((plot) => plot.status === "available");
  const availableCount = availablePlots.length;
  const soldCount = inventory.filter((plot) => plot.status === "sold").length;
  const pendingCount = total - availableCount - soldCount;

  const minAvailablePriceYen = availablePlots.length
    ? Math.min(...availablePlots.map((plot) => plot.price_yen))
    : null;

  const soldPercent = total === 0 ? 0 : Math.round((soldCount / total) * 100);
  const isLowStock = total > 0 && availableCount > 0 && availableCount / total <= 0.2;

  return { total, availableCount, soldCount, pendingCount, minAvailablePriceYen, soldPercent, isLowStock };
}

export type PlotBlockGroup<T> = { blockLabel: string | null; plots: T[] };

// block_labelごとにまとめる。街区が1種類しか無い(または全てnull)場合は
// 見出しだけが増えて情報量が減るため、グルーピングせず1グループで返す。
export function groupPlotsByBlock<T extends { block_label?: string | null }>(plots: T[]): PlotBlockGroup<T>[] {
  const distinctLabels = new Set(plots.map((plot) => plot.block_label ?? null));
  if (distinctLabels.size <= 1) {
    return [{ blockLabel: null, plots }];
  }

  const groups: PlotBlockGroup<T>[] = [];
  for (const plot of plots) {
    const label = plot.block_label ?? null;
    const existing = groups.find((group) => group.blockLabel === label);
    if (existing) {
      existing.plots.push(plot);
    } else {
      groups.push({ blockLabel: label, plots: [plot] });
    }
  }
  return groups;
}
