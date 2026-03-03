"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import Navbar from "@/components/navbar";
import CreatePost from "@/components/CreatePost";

export default function CreatePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Checking login...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Navbar />
        <div className="flex h-[calc(100vh-73px)] flex-col items-center justify-center text-center">
          <h2 className="mb-4 text-2xl font-bold">You must login to create a post</h2>
          <button
            onClick={() => router.push("/")}
            className="rounded-xl bg-[#ff6a00] px-6 py-3"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <div className="mx-auto max-w-2xl p-6">
        <CreatePost />
      </div>
    </div>
  );
}
