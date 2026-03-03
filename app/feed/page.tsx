"use client";

import { useState } from "react";
import Navbar from "@/components/navbar";
import CreatePost from "@/components/CreatePost";
import PostFeed from "@/components/PostFeed";

export default function FeedPage() {
  const [publicMode, setPublicMode] = useState(true);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />

      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-5">
          <div className="rounded-2xl border border-[#2b2b2b] bg-[#121212] p-4">
            <p className="text-sm font-semibold text-[#ff8c42]">Live Study Session</p>
            <div className="mt-2 flex items-center justify-between rounded-xl border border-[#ff6a00] bg-[#191919] px-3 py-2">
              <p className="text-sm text-gray-300">General Room - 27 members active</p>
              <button className="rounded-lg bg-[#ff6a00] px-3 py-1 text-sm font-semibold">
                Join
              </button>
            </div>
          </div>

          <PostFeed />
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-[#ff6a00] bg-[#141414] p-4 shadow-[0_0_16px_rgba(255,106,0,0.2)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-[#ff8c42]">Identity Toggle</p>
              <button
                onClick={() => setPublicMode((prev) => !prev)}
                className={`h-6 w-11 rounded-full p-1 transition ${
                  publicMode ? "bg-[#ff6a00]" : "bg-[#303030]"
                }`}
              >
                <span
                  className={`block h-4 w-4 rounded-full bg-white transition ${
                    publicMode ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-gray-400">
              {publicMode ? "Public Profile" : "Incognito Mode"}
            </p>
          </div>

          <CreatePost mode="compact" />

          <div className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
            <div className="mx-auto h-16 w-16 rounded-full border border-[#ff8c42] bg-[#1f1f1f]" />
            <h3 className="mt-3 text-center text-lg font-semibold">User Profile</h3>
            <p className="text-center text-xs text-gray-400">@campus_user</p>

            <div className="mt-4 space-y-2 text-sm">
              <p className="text-gray-400">Skills</p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md bg-[#2a1b12] px-2 py-1 text-xs text-[#ff8c42]">#UI/UX</span>
                <span className="rounded-md bg-[#2a1b12] px-2 py-1 text-xs text-[#ff8c42]">#Python</span>
                <span className="rounded-md bg-[#2a1b12] px-2 py-1 text-xs text-[#ff8c42]">#Startup</span>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                <span>Helpfulness Level</span>
                <span>15.6</span>
              </div>
              <div className="h-2 rounded-full bg-[#2f2f2f]">
                <div className="h-2 w-4/5 rounded-full bg-[#ff6a00]" />
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
