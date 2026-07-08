import { BottomNav } from "@/components/BottomNav";
import { LegalFooter } from "@/components/LegalFooter";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <div className="flex-1">{children}</div>
      <LegalFooter />
      <BottomNav />
    </div>
  );
}
