"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeHandle } from "@/lib/profile";
import { getLevelFromSapphires } from "@/lib/rewards";

export default function ProfileSetupPage() {
  const [nickname, setNickname] = useState("");
  const [handle, setHandle] = useState("");
  const [handleEdited, setHandleEdited] = useState(false);
  const [hobbies, setHobbies] = useState("");
  const [interests, setInterests] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/");
      return;
    }

    if (!nickname.trim() || !hobbies.trim() || !interests.trim()) {
      alert("Please fill all profile fields.");
      return;
    }
    const normalizedHandle = normalizeHandle(handle || nickname);
    if (!normalizedHandle.trim()) {
      alert("Username handle is required.");
      return;
    }

    try {
      setSaving(true);
      const handleQuery = query(collection(db, "users"), where("handle", "==", normalizedHandle));
      const handleMatches = await getDocs(handleQuery);
      const isTaken = handleMatches.docs.some((match) => match.id !== user.uid);
      if (isTaken) {
        alert("This @username is already taken. Please choose another one.");
        setSaving(false);
        return;
      }

      const initialLevel = getLevelFromSapphires(0);
      await setDoc(
        doc(db, "users", user.uid),
        {
          nickname: nickname.trim(),
          handle: normalizedHandle,
          hobbies: hobbies.trim(),
          interests: interests.trim(),
          bio: "",
          skills: [],
          avatarSeed: user.uid,
          avatarUrl: user.photoURL ?? "",
          publicProfile: true,
          linkedin: "",
          github: "",
          sapphires: 0,
          level: initialLevel.level,
          levelTitle: initialLevel.title,
          postsCount: 0,
          commentsCount: 0,
          postStreak: 0,
          lastPostRewardDate: "",
          upvoteRewardDate: "",
          upvoteRewardToday: 0,
          loginStreak: 0,
          lastLoginDate: "",
          email: user.email ?? "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      router.push("/feed");
    } catch (error) {
      console.error(error);
      alert("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4 text-white">
      <div className="w-full max-w-sm space-y-4 rounded-xl bg-[#1a1a1a] p-8">
        <h2 className="text-center text-xl font-bold">Complete Your Profile</h2>

        <input
          placeholder="Nickname"
          className="w-full rounded bg-[#0f0f0f] p-2"
          value={nickname}
          onChange={(e) => {
            const nextNickname = e.target.value;
            setNickname(nextNickname);
            if (!handleEdited) {
              setHandle(normalizeHandle(nextNickname));
            }
          }}
        />

        <input
          placeholder="Username handle (@...)"
          className="w-full rounded bg-[#0f0f0f] p-2"
          value={handle}
          onChange={(e) => {
            setHandleEdited(true);
            setHandle(normalizeHandle(e.target.value));
          }}
        />

        <input
          placeholder="Hobbies"
          className="w-full rounded bg-[#0f0f0f] p-2"
          value={hobbies}
          onChange={(e) => setHobbies(e.target.value)}
        />

        <input
          placeholder="Interests"
          className="w-full rounded bg-[#0f0f0f] p-2"
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
        />

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full rounded-lg bg-[#ff6a00] py-2 disabled:opacity-70"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </div>
  );
}
