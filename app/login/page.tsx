"use client";

import {
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        router.replace("/");
      }
    });
  }, [router]);

  function login() {
    const provider = new GoogleAuthProvider();
    signInWithRedirect(auth, provider);
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