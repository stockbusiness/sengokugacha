// LIFF共通レイアウト(SideMenu/BottomNav)を持たない、代理店ポータル専用レイアウト。
// sengoku-ai.comからのSSOで来訪する想定のため、PCブラウザでの閲覧を主眼にする。
export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink text-parchment">
      <div className="mx-auto max-w-2xl px-4 py-8">{children}</div>
    </div>
  );
}
