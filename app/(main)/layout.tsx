"use client";

import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid grid-cols-12 transition-colors duration-300 bg-slate-50 dark:bg-zinc-950">
      {/* Sidebar */}
      <div className="hidden md:block md:col-span-2 sticky top-0 h-screen">
        <Sidebar />
      </div>

      {/* Feed */}
      <div className="col-span-12 md:col-span-7 overflow-y-auto min-h-screen">
        {children}
      </div>

      {/* Chat */}
      <div className="hidden lg:block lg:col-span-3 border-l border-zinc-200 dark:border-zinc-800 sticky top-0 h-screen bg-white dark:bg-zinc-900">
        <ChatPanel />
      </div>
    </div>
  );
}
