"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const communities = [
  "General",
  "Startups",
  "JEE",
  "Mental Health",
  "Coding",
];

const liveRooms = [
  {
    room: "Midterm Sprint",
    members: ["Riya", "Aman", "Nikhil"],
  },
  {
    room: "Rust Practice",
    members: ["Sara", "Dee", "Ira"],
  },
];

function avatar(seed: string) {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
}

export default function Sidebar() {
  const searchParams = useSearchParams();
  const active = searchParams.get("community") ?? "All";

  return (
    <div className="h-full p-4 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 transition-colors duration-300 flex flex-col">
      <h2 className="text-xl font-bold mb-4 text-indigo-600 dark:text-violet-400">Spheera</h2>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">Navigation</p>
        <ul className="space-y-2">
          <li>
            <Link className="block p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800" href="/">
              Home
            </Link>
          </li>
          <li>
            <Link
              className="block p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
              href="/?sort=popular"
            >
              Popular
            </Link>
          </li>
          <li>
            <Link
              className="block p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800"
              href="/?sort=discover"
            >
              Discover
            </Link>
          </li>
        </ul>
      </div>

      <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">Communities</p>
      <ul className="space-y-2">
        <li>
          <Link
            href="/"
            className={`block cursor-pointer p-2 rounded-lg transition-colors duration-200 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:font-semibold ${
              active === "All" ? "bg-slate-100 dark:bg-zinc-800 font-semibold" : ""
            }`}
          >
            #All
          </Link>
        </li>
        {communities.map((c) => (
          <li key={c}>
            <Link
              href={`/?community=${encodeURIComponent(c)}`}
              className={`block cursor-pointer p-2 rounded-lg transition-colors duration-200 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:font-semibold ${
                active === c ? "bg-slate-100 dark:bg-zinc-800 font-semibold" : ""
              }`}
            >
              #{c}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">Live Rooms</p>
        <div className="space-y-3">
          {liveRooms.map((room) => (
            <div key={room.room} className="p-2 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{room.room}</p>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">Live now</span>
              </div>
              <div className="mt-2 flex -space-x-2">
                {room.members.map((member) => (
                  <Image
                    key={member}
                    src={avatar(member)}
                    alt={member}
                    width={22}
                    height={22}
                    className="rounded-full border border-white dark:border-zinc-900"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-6">
        <ThemeToggle />
      </div>
    </div>
  );
}

