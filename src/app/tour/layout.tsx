// LIFF共通レイアウト(SideMenu/BottomNav/LegalFooter)を持たない、外部全画面内覧専用のレイアウト。
// スマートフォン横画面・タブレット・PCのレスポンシブ対応を主目的とするため、
// (app)グループの縦画面前提レイアウトとは完全に分離する。
export default function TourLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-black text-parchment">{children}</div>;
}
