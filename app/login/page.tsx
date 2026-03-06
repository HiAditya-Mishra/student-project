"use client";

import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { rewardLoginStreak } from "@/lib/rewards";

export default function LoginPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  const routeLoggedInUser = useCallback(async (uid: string) => {
    const userDoc = await getDoc(doc(db, "users", uid));
    await rewardLoginStreak(uid);
    router.replace(userDoc.exists() ? "/feed" : "/profile-setup");
  }, [router]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCheckingAuth(false);
        return;
      }
      await routeLoggedInUser(user.uid);
    });

    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          await routeLoggedInUser(result.user.uid);
        }
      })
      .finally(() => setCheckingAuth(false));

    return () => unsubscribe();
  }, [routeLoggedInUser]);

  function login() {
    const provider = new GoogleAuthProvider();
    signInWithRedirect(auth, provider);
  }

  if (checkingAuth) {
    return <main className="min-h-screen flex items-center justify-center bg-gray-100">Checking login...</main>;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <button
        onClick={login}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg"
      >
        Login with Google
      </button>
    </main>
  );
}
