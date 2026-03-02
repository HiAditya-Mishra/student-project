"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../lib/firebase";

export default function LoginPage() {
  async function login() {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    alert("Logged in successfully");
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <button
        onClick={login}
        className="px-6 py-3 bg-blue-600 text-white rounded"
      >
        Login with Google
      </button>
    </main>
  );
}