import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import Sidebar from "@/components/dashboard/Sidebar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }

  return (
    <div className="relative h-full bg-[var(--bg-base)] p-4 sm:p-6">
      <Sidebar />
      <main className="scrollbar-hide h-full min-h-0 overflow-y-auto pl-[92px] sm:pl-[104px]">
        {children}
      </main>
    </div>
  );
}
