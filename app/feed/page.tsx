"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar";
import CreatePost from "@/components/CreatePost";
import PostFeed from "@/components/PostFeed";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";

type UserProfile = {
  nickname?: string;
  skills?: string[];
  avatarSeed?: string;
  publicProfile?: boolean;
  bio?: string;
};

function avatarUrl(seed: string) {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed || "campus-user")}`;
}

export default function FeedPage() {
  const router = useRouter();
  const [publicMode, setPublicMode] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        if (profileUnsubscribe) {
          profileUnsubscribe();
          profileUnsubscribe = null;
        }
        setProfile(null);
        setAuthLoading(false);
        return;
      }

      const profileRef = doc(db, "users", user.uid);
      if (profileUnsubscribe) {
        profileUnsubscribe();
      }
      profileUnsubscribe = onSnapshot(profileRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as UserProfile;
          setProfile(data);
          setPublicMode(data.publicProfile ?? true);
        } else {
          setProfile({
            nickname: user.displayName || "Campus User",
            skills: [],
            avatarSeed: user.uid,
            publicProfile: true,
          });
          setPublicMode(true);
        }
        setAuthLoading(false);
      });
    });

    return () => {
      if (profileUnsubscribe) {
        profileUnsubscribe();
      }
      unsubscribe();
    };
  }, []);

  const displayName = useMemo(() => {
    return profile?.nickname || auth.currentUser?.displayName || "Campus User";
  }, [profile?.nickname]);

  const topSkills = (profile?.skills ?? []).slice(0, 4);

  const handleToggleVisibility = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const next = !publicMode;
    setPublicMode(next);
    try {
      await setDoc(doc(db, "users", user.uid), { publicProfile: next }, { merge: true });
      setProfile((prev) => ({ ...(prev ?? {}), publicProfile: next }));
    } catch (error) {
      console.error(error);
      setPublicMode(!next);
      alert("Could not update profile visibility.");
    }
  };

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
                onClick={() => void handleToggleVisibility()}
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
            <img
              src={avatarUrl(profile?.avatarSeed || auth.currentUser?.uid || "campus-user")}
              alt={displayName}
              className="mx-auto h-16 w-16 rounded-full border border-[#ff8c42] bg-[#1f1f1f]"
            />
            <h3 className="mt-3 text-center text-lg font-semibold">{displayName}</h3>
            <p className="text-center text-xs text-gray-400">
              @{(displayName || "campus_user").toLowerCase().replace(/\s+/g, "_")}
            </p>

            <div className="mt-4 space-y-2 text-sm">
              <p className="text-gray-400">Skills</p>
              <div className="flex flex-wrap gap-2">
                {topSkills.length ? (
                  topSkills.map((skill) => (
                    <span key={skill} className="rounded-md bg-[#2a1b12] px-2 py-1 text-xs text-[#ff8c42]">
                      #{skill}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-500">Add skills from your profile page.</span>
                )}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                <span>Helpfulness Level</span>
                <span>{Math.max(10, (topSkills.length * 7.5 + 10)).toFixed(1)}</span>
              </div>
              <div className="h-2 rounded-full bg-[#2f2f2f]">
                <div
                  className="h-2 rounded-full bg-[#ff6a00]"
                  style={{ width: `${Math.min(95, 35 + topSkills.length * 12)}%` }}
                />
              </div>
            </div>

            <button
              onClick={() => router.push("/profile")}
              className="mt-4 w-full rounded-lg border border-[#ff6a00] px-3 py-2 text-sm font-semibold text-[#ff8c42] transition hover:bg-[#1f120a]"
            >
              Edit Profile
            </button>

            {authLoading ? <p className="mt-2 text-xs text-gray-500">Syncing profile...</p> : null}
          </div>
        </aside>
      </main>
    </div>
  );
}
