"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import Navbar from "@/components/navbar";
import { resolveAvatar, UserProfileDoc } from "@/lib/profile";

type PublicProfile = UserProfileDoc & {
  email?: string;
};

export default function PublicProfilePage() {
  const params = useParams<{ uid: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const uid = Array.isArray(params?.uid) ? params.uid[0] : params?.uid;

  useEffect(() => {
    if (!uid) {
      setError("Profile not found.");
      setLoading(false);
      return;
    }

    const run = async () => {
      try {
        const snapshot = await getDoc(doc(db, "users", uid));
        if (!snapshot.exists()) {
          setError("Profile not found.");
          setProfile(null);
          return;
        }

        const data = snapshot.data() as PublicProfile;
        const isOwner = auth.currentUser?.uid === uid;
        if (data.publicProfile === false && !isOwner) {
          setError("This profile is private.");
          setProfile(null);
          return;
        }

        setError(null);
        setProfile(data);
      } catch (readError) {
        console.error(readError);
        setError(
          typeof readError === "object" &&
            readError &&
            "code" in readError &&
            readError.code === "permission-denied"
            ? "This profile is private."
            : "Could not load this profile.",
        );
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [uid]);

  const avatar = useMemo(() => resolveAvatar(profile, uid), [profile, uid]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        {loading ? <p className="text-gray-400">Loading profile...</p> : null}

        {!loading && error ? (
          <div className="rounded-2xl border border-[#2d2d2d] bg-[#141414] p-6">
            <p className="text-sm text-red-300">{error}</p>
            <button
              onClick={() => router.push("/feed")}
              className="mt-4 rounded-lg bg-[#ff6a00] px-4 py-2 text-sm font-semibold"
            >
              Back to Feed
            </button>
          </div>
        ) : null}

        {!loading && !error && profile ? (
          <section className="rounded-2xl border border-[#2d2d2d] bg-[#141414] p-6">
            <div className="flex items-start gap-4">
              <img src={avatar} alt={profile.nickname || "User"} className="h-20 w-20 rounded-full border border-[#ff8c42]" />
              <div>
                <h1 className="text-2xl font-bold text-[#ff8c42]">{profile.nickname || "Campus User"}</h1>
                <p className="text-sm text-gray-400">@{profile.handle || "campus_user"}</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Bio</p>
                <p className="mt-1 text-sm text-gray-300 whitespace-pre-wrap break-words">
                  {profile.bio || "No bio yet."}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Hobbies</p>
                  <p className="mt-1 text-sm text-gray-300 whitespace-pre-wrap break-words">{profile.hobbies || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Interests</p>
                  <p className="mt-1 text-sm text-gray-300 whitespace-pre-wrap break-words">{profile.interests || "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Skills</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(profile.skills ?? []).length ? (
                    (profile.skills ?? []).map((skill) => (
                      <span key={skill} className="rounded-md bg-[#2a1b12] px-2 py-1 text-xs text-[#ff8c42]">
                        #{skill}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">No skills added.</span>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
