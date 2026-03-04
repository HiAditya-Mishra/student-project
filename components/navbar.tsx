"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

const links = [
  { label: "Feed", href: "/feed" },
  { label: "Communities", href: "/communities" },
  { label: "Study Rooms", href: "/study-rooms" },
  { label: "Vent", href: "/vent" },
  { label: "Profile", href: "/profile" },
];

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = new URLSearchParams(window.location.search).get("q") ?? "";
    setSearchInput(query);
  }, [pathname]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = searchInput.trim();
    if (!query) {
      router.push("/feed");
      return;
    }
    router.push(`/feed?q=${encodeURIComponent(query)}`);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-[#262626] bg-[#111111]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <button onClick={() => router.push("/feed")} className="text-left text-lg font-bold tracking-wide">
          Campus<span className="text-[#ff6a00]">Sphere</span>
        </button>

        <nav className="hidden items-center gap-5 text-sm text-gray-300 lg:flex">
          {links.map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`border-b-2 pb-1 transition ${
                pathname === item.href
                  ? "border-[#ff6a00] text-[#ff8c42]"
                  : "border-transparent hover:text-[#ff8c42]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <form
            onSubmit={handleSearch}
            className="hidden items-center rounded-full border border-[#2d2d2d] bg-[#1a1a1a] px-3 py-1.5 sm:flex"
          >
            <input
              placeholder="Search posts or @people"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="w-28 bg-transparent text-sm outline-none placeholder:text-gray-500"
            />
            <button type="submit" className="rounded-full bg-[#ff6a00] px-2 py-0.5 text-xs">
              Q
            </button>
          </form>

          <button
            onClick={() => router.push("/create")}
            className="rounded-full bg-[#ff6a00] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#ff8c42]"
          >
            Post
          </button>

          {user ? (
            <button
              onClick={() => router.push("/profile")}
              className="h-9 w-9 rounded-full border border-[#ff8c42] bg-[#1a1a1a] text-sm"
              title="Profile"
            >
              U
            </button>
          ) : (
            <button
              onClick={() => router.push("/")}
              className="h-9 w-9 rounded-full border border-[#2f2f2f] bg-[#1a1a1a] text-sm"
              title="Login"
            >
              G
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
