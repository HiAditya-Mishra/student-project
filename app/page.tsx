"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { rewardLoginStreak } from "@/lib/rewards";

export default function Home() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCheckingAuth(false);
        return;
      }

      const userDoc = await getDoc(doc(db, "users", user.uid));
      await rewardLoginStreak(user.uid);
      router.replace(userDoc.exists() ? "/feed" : "/profile-setup");
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const userDoc = await getDoc(doc(db, "users", result.user.uid));

      if (!userDoc.exists()) {
        router.push("/profile-setup");
        return;
      }

      router.push("/feed");
    } catch (error) {
      console.error(error);
      alert("Login failed. Please try again.");
    }
  };

  if (checkingAuth) {
    return <div className="flex h-screen items-center justify-center bg-[#0f0f0f] text-gray-400">Checking login...</div>;
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[#0f0f0f] px-4">
      <div className="space-y-6 text-center">
        <h1 className="text-5xl font-bold tracking-wide text-white">
          Sph<span className="text-[#ff6a00]">eera</span>
        </h1>

        <p className="text-lg text-gray-400">Built by students. For students.</p>

        <div className="flex justify-center gap-4">
          <button
            onClick={handleLogin}
            className="orange-gradient rounded-xl px-6 py-3 font-semibold transition hover:scale-105"
          >
            Login with Google
          </button>

          <button
            onClick={() => router.push("/feed")}
            className="rounded-xl border border-gray-700 bg-[#1a1a1a] px-6 py-3 transition hover:border-[#ff6a00]"
          >
            Explore
          </button>
        </div>
      </div>
    </div>
  );
}
