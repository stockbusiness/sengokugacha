import { BottomNav } from "@/components/BottomNav";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <div className="flex-1">{children}</div>
      <BottomNav />
    </div>
  );
}
