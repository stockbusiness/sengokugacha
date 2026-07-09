import { BottomNav } from "@/components/BottomNav";
import { LegalFooter } from "@/components/LegalFooter";
import { SideMenu } from "@/components/SideMenu";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <SideMenu />
      <div className="flex-1">{children}</div>
      <LegalFooter />
      <BottomNav />
    </div>
  );
}
