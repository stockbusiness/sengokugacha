export type DevelopmentPlotStatus =
  | "preparing"
  | "nation_building"
  | "metaverse_pending"
  | "priority"
  | "confirming";

export const DEVELOPMENT_PLOT_STATUS_LABELS: Record<DevelopmentPlotStatus, string> = {
  preparing: "準備中",
  nation_building: "国家建設フェーズ",
  metaverse_pending: "メタバース反映予定",
  priority: "優先開発対象",
  confirming: "確認待ち",
};

export function developmentPlotStatusLabel(status: string): string {
  return DEVELOPMENT_PLOT_STATUS_LABELS[status as DevelopmentPlotStatus] ?? status;
}

export function formatFoundingMemberNumber(n: number): string {
  return `FND-${String(n).padStart(6, "0")}`;
}

// Ver2.1初期実装では決済を行わないため、価格は固定文言として定義する
// (指示書8章: 「初期実装では固定文言でも可」)。管理画面での変更が必要になった場合は
// line_settings 等に価格カラムを追加して置き換える。
export const NATION_BUILDER_OFFER = {
  title: "建国メンバー募集",
  description:
    "AIを学び、作品を作り、戦国経済圏の中で販売・発信する中核メンバーを募集しています。",
  regularPrice: 198000,
  foundingMemberPrice: 98000,
};
