"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar";
import CreatePost from "@/components/CreatePost";
import PostFeed from "@/components/PostFeed";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { usePathname, useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { normalizeHandle, resolveAvatar, UserProfileDoc } from "@/lib/profile";

type UserProfile = UserProfileDoc;
type UserListItem = UserProfileDoc & { id: string };

type StudyRoom = {
  id: string;
  name?: string;
  participants?: string[];
};

type Post = {
  id: string;
  authorId?: string;
  likes?: number;
};

export default function FeedPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [publicMode, setPublicMode] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [sapphire, setSapphire] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;
    let postsUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        if (profileUnsubscribe) {
          profileUnsubscribe();
          profileUnsubscribe = null;
        }
        if (postsUnsubscribe) {
          postsUnsubscribe();
          postsUnsubscribe = null;
        }
        setProfile(null);
        setSapphire(0);
        setAuthLoading(false);
        return;
      }

      const profileRef = doc(db, "users", user.uid);
      if (profileUnsubscribe) profileUnsubscribe();
      profileUnsubscribe = onSnapshot(
        profileRef,
        (snapshot) => {
          setProfileError(null);
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
        },
        (error) => {
          console.error(error);
          setProfileError(
            error.code === "permission-denied"
              ? "Profile access is blocked by Firestore rules."
              : "Could not load profile settings.",
          );
          setAuthLoading(false);
        },
      );

      if (postsUnsubscribe) postsUnsubscribe();
      postsUnsubscribe = onSnapshot(
        collection(db, "posts"),
        (snapshot) => {
          const totalLikes = snapshot.docs
            .map((docSnapshot) => ({ id: docSnapshot.id, ...(docSnapshot.data() as Omit<Post, "id">) }))
            .filter((post) => post.authorId === user.uid)
            .reduce((sum, post) => sum + (post.likes ?? 0), 0);
          setSapphire(totalLikes);
        },
        (error) => {
          console.error(error);
          if (error.code === "permission-denied") {
            setSapphire(0);
          }
        },
      );
    });

    return () => {
      if (profileUnsubscribe) profileUnsubscribe();
      if (postsUnsubscribe) postsUnsubscribe();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = new URLSearchParams(window.location.search).get("q") ?? "";
    setSearchTerm(query);
  }, [pathname]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const fetchedUsers: UserListItem[] = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as UserProfileDoc),
        }));
        setUsers(fetchedUsers);
      },
      (error) => {
        console.error(error);
        setUsers([]);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "studyRooms"),
      (snapshot) => {
        setRoomsError(null);
        const fetchedRooms: StudyRoom[] = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Omit<StudyRoom, "id">),
        }));
        setRooms(fetchedRooms);
      },
      (error) => {
        console.error(error);
        setRoomsError(
          error.code === "permission-denied"
            ? "Study rooms are not accessible with current Firestore rules."
            : "Failed to load study rooms.",
        );
        setRooms([]);
      },
    );

    return () => unsubscribe();
  }, []);

  const displayName = useMemo(() => {
    return profile?.nickname || auth.currentUser?.displayName || "Campus User";
  }, [profile?.nickname]);

  const topSkills = (profile?.skills ?? []).slice(0, 4);
  const liveRoom = rooms.find((room) => (room.participants?.length ?? 0) > 0);
  const readOnlyMode = !publicMode;
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const matchedProfiles = useMemo(() => {
    if (!normalizedSearch) return [];
    const token = normalizedSearch.startsWith("@") ? normalizedSearch.slice(1) : normalizedSearch;

    return users
      .filter((user) => {
        const nickname = (user.nickname || "").toLowerCase();
        const handle = normalizeHandle(user.handle || user.nickname || "");
        const skills = (user.skills ?? []).join(" ").toLowerCase();
        const hobbies = (user.hobbies || "").toLowerCase();
        const interests = (user.interests || "").toLowerCase();
        return (
          nickname.includes(token) ||
          handle.includes(token) ||
          skills.includes(token) ||
          hobbies.includes(token) ||
          interests.includes(token)
        );
      })
      .slice(0, 8);
  }, [normalizedSearch, users]);

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
            <p className="text-sm font-semibold text-[#ff8c42]">Live Study Rooms</p>
            <div className="mt-2 flex items-center justify-between rounded-xl border border-[#ff6a00] bg-[#191919] px-3 py-2">
              <p className="text-sm text-gray-300">
                {liveRoom
                  ? `${liveRoom.name || "Untitled Room"} | ${liveRoom.participants?.length ?? 0} active`
                  : "No live room right now"}
              </p>
              <button
                onClick={() => router.push("/study-rooms")}
                className="rounded-lg bg-[#ff6a00] px-3 py-1 text-sm font-semibold"
              >
                {liveRoom ? "Join" : "Open"}
              </button>
            </div>
            {roomsError ? <p className="mt-2 text-xs text-red-300">{roomsError}</p> : null}
          </div>

          {normalizedSearch ? (
            <div className="rounded-2xl border border-[#2d2d2d] bg-[#141414] p-4">
              <p className="text-sm font-semibold text-[#ff8c42]">Matching Profiles</p>
              {matchedProfiles.length ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {matchedProfiles.map((matched) => (
                    <button
                      key={matched.id}
                      type="button"
                      onClick={() => router.push(`/profile/${matched.id}`)}
                      className="flex items-center gap-2 rounded-xl border border-[#2e2e2e] bg-[#111111] p-2 text-left hover:border-[#ff6a00]"
                    >
                      <img
                        src={resolveAvatar(matched, matched.id)}
                        alt={matched.nickname || "User"}
                        className="h-10 w-10 rounded-full border border-[#ff8c42]"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{matched.nickname || "Campus User"}</p>
                        <p className="truncate text-xs text-gray-400">@{normalizeHandle(matched.handle || matched.nickname || "")}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No profiles match "{searchTerm}".</p>
              )}
            </div>
          ) : null}

          <PostFeed searchTerm={searchTerm} readOnly={readOnlyMode} />
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
              {publicMode ? "Public Profile: full actions enabled" : "Incognito: view-only mode enabled"}
            </p>
            {profileError ? <p className="mt-2 text-xs text-red-300">{profileError}</p> : null}
          </div>

          {readOnlyMode ? (
            <div className="rounded-2xl border border-[#2d2d2d] bg-[#141414] p-4 text-sm text-gray-300">
              Posting is disabled in incognito mode. Switch to Public Profile to create or interact with posts.
            </div>
          ) : (
            <CreatePost mode="compact" />
          )}

          <div className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
            <img
              src={resolveAvatar(profile, auth.currentUser?.uid || "campus-user")}
              alt={displayName}
              className="mx-auto h-16 w-16 rounded-full border border-[#ff8c42] bg-[#1f1f1f]"
            />
            <h3 className="mt-3 text-center text-lg font-semibold">{displayName}</h3>
            <p className="text-center text-xs text-gray-400">
              @{normalizeHandle(profile?.handle || displayName || "campus_user")}
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

            <div className="mt-4 rounded-xl border border-[#2d2d2d] bg-[#101010] p-3">
              <p className="text-xs text-gray-400">Sapphire</p>
              <p className="mt-1 text-2xl font-bold text-[#5bc0ff]">{sapphire}</p>
              <p className="mt-1 text-xs text-gray-500">Earn Sapphire from likes on your posts.</p>
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
