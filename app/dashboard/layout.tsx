import { getCurrentUser, getCurrentWorkspaceContext } from "@/app/lib/auth/dal";
import Sidebar from "@/app/components/dashboard/Sidebar";
import UserMenu from "@/app/components/dashboard/UserMenu";
import type { ReactNode } from "react";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [user, ctx] = await Promise.all([getCurrentUser(), getCurrentWorkspaceContext()]);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex">
        <Sidebar role={user.role} workspaceName={ctx.workspace.name} />
        <div className="flex min-h-screen w-full flex-col lg:pl-64">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-3 backdrop-blur">
            <div>
              <p className="text-xs text-slate-500">Workspace</p>
              <p className="text-sm font-medium text-slate-900">{ctx.workspace.name}</p>
            </div>
            <UserMenu name={user.name} email={user.email} role={user.role} />
          </header>
          <main className="flex-1 px-6 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
