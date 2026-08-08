import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import Sidebar from "@/components/dashboard/Sidebar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }

  return (
    <div className="grain-bg relative flex h-full gap-4 p-4 sm:gap-6 sm:p-6">
      <main className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
        {children}
      </main>
      <Sidebar />
    </div>
  );
}
