"use client";

import { useRouter } from "next/navigation";

export default function ChatPanel() {
  const router = useRouter();

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900 transition-colors duration-300">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 font-semibold text-indigo-600 dark:text-violet-400">
        Messages
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
        <div className="bg-slate-100 dark:bg-zinc-800 p-2 rounded-lg">
          Group and direct chat are now available.
        </div>
        <button
          onClick={() => router.push("/messages")}
          className="rounded-lg bg-indigo-500 px-3 py-2 text-white"
        >
          Open Messages
        </button>
      </div>

      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
        <input
          placeholder="Type a message..."
          className="w-full p-2 rounded-lg bg-slate-50 dark:bg-zinc-800 outline-none"
        />
      </div>
    </div>
  );
}
