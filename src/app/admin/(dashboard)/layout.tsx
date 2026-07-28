import { getAdminRole } from "@/lib/admin-session";
import { AdminSidebar } from "./admin-sidebar";
import LogoutButton from "./logout-button";
import { AdminThemeProvider } from "./theme-provider";
import { ThemeToggleButton } from "./theme-toggle-button";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const adminRole = await getAdminRole();
  return (
    <AdminThemeProvider>
      <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 dark:bg-black dark:text-zinc-50">
        <div className="flex min-h-screen flex-col md:flex-row">
          <AdminSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center justify-end gap-3 px-4 py-3">
                {adminRole && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      adminRole === "manager"
                        ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {adminRole === "manager" ? "本部管理者" : "本部担当者"}
                  </span>
                )}
                <ThemeToggleButton />
                <LogoutButton />
              </div>
            </header>
            <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
          </div>
        </div>
      </div>
    </AdminThemeProvider>
  );
}
