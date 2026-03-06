"use client";

import { useRouter } from "next/navigation";

export default function ChatPanel() {
  const router = useRouter();

  return (
    <div className="h-full flex flex-col bg-[#141414] text-white">
      <div className="border-b border-[#2f2f2f] p-4 font-semibold text-[#ff8c42]">
        Messages
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        <div className="rounded-lg border border-[#2f2f2f] bg-[#101010] p-2 text-gray-300">
          Group and direct chat are now available.
        </div>
        <button
          onClick={() => router.push("/messages")}
          className="rounded-lg bg-[#ff6a00] px-3 py-2 text-white hover:bg-[#ff8c42]"
        >
          Open Messages
        </button>
      </div>

      <div className="border-t border-[#2f2f2f] p-3">
        <input
          placeholder="Type a message..."
          className="w-full rounded-lg border border-[#2f2f2f] bg-[#101010] p-2 text-sm outline-none focus:border-[#ff6a00]"
        />
      </div>
    </div>
  );
}
