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
import { rewardLoginStreak, STREAK_INSURANCE_COST, useStreakInsurance } from "@/lib/rewards";

type UserProfile = UserProfileDoc;
type AuthorSearchItem = {
  id: string;
  nickname: string;
  handle: string;
  avatarUrl?: string;
};

type StudyRoom = {
  id: string;
  name?: string;
  participants?: string[];
};

export default function FeedPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [publicMode, setPublicMode] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [feedMode, setFeedMode] = useState<"for-you" | "following">("for-you");
  const [searchAuthors, setSearchAuthors] = useState<AuthorSearchItem[]>([]);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [usingInsurance, setUsingInsurance] = useState(false);

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
      void rewardLoginStreak(user.uid);

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
    });

    return () => {
      if (profileUnsubscribe) profileUnsubscribe();
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
      collection(db, "posts"),
      (snapshot) => {
        const seen = new Set<string>();
        const nextAuthors: AuthorSearchItem[] = [];
        snapshot.docs.forEach((docSnapshot) => {
          const data = docSnapshot.data() as {
            authorId?: string;
            author?: string;
            authorHandle?: string;
            authorAvatarUrl?: string;
          };
          const id = data.authorId?.trim();
          if (!id || seen.has(id)) return;
          seen.add(id);

          nextAuthors.push({
            id,
            nickname: (data.author || "Campus User").trim(),
            handle: normalizeHandle(data.authorHandle || data.author || ""),
            avatarUrl: data.authorAvatarUrl,
          });
        });
        setSearchAuthors(nextAuthors);
      },
      (error) => {
        console.error(error);
        setSearchAuthors([]);
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
  const sapphire = Number(profile?.sapphires ?? 0);
  const levelTitle = String(profile?.levelTitle ?? "Fresher");
  const liveRoom = rooms.find((room) => (room.participants?.length ?? 0) > 0);
  const readOnlyMode = !publicMode;
  const followingUsers = profile?.followingUsers ?? [];
  const followingCommunities = profile?.followingCommunities ?? [];
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const utcDateKey = (offset = 0) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const today = utcDateKey(0);
  const yesterday = utcDateKey(-1);
  const monthlyInsuranceUsed = profile?.streakInsuranceMonthKey === today.slice(0, 7);
  const insuranceNeeded = Boolean(
    (profile?.postStreak ?? 0) > 0 &&
      profile?.lastPostRewardDate &&
      profile.lastPostRewardDate !== today &&
      profile.lastPostRewardDate !== yesterday,
  );
  const canUseInsurance = insuranceNeeded && !monthlyInsuranceUsed && sapphire >= STREAK_INSURANCE_COST;

  const matchedProfiles = useMemo(() => {
    if (!normalizedSearch) return [];
    const token = normalizedSearch.startsWith("@") ? normalizedSearch.slice(1) : normalizedSearch;

    return searchAuthors
      .filter((author) => {
        const nickname = author.nickname.toLowerCase();
        const handle = author.handle;
        return (
          nickname.includes(token) ||
          handle.includes(token)
        );
      })
      .slice(0, 8);
  }, [normalizedSearch, searchAuthors]);

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

  const toggleFollowAuthor = async (authorId: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid === authorId) return;

    const current = new Set(followingUsers);
    if (current.has(authorId)) current.delete(authorId);
    else current.add(authorId);
    const next = Array.from(current);

    setProfile((prev) => ({ ...(prev ?? {}), followingUsers: next }));
    try {
      await setDoc(doc(db, "users", currentUser.uid), { followingUsers: next }, { merge: true });
    } catch (error) {
      console.error(error);
    }
  };

  const handleUseStreakInsurance = async () => {
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first.");
      return;
    }

    try {
      setUsingInsurance(true);
      const result = await useStreakInsurance(user.uid);
      if (!result.ok) {
        if (result.reason === "NOT_NEEDED_YET") alert("Streak insurance is only for recovering a missed day.");
        else if (result.reason === "ALREADY_USED_THIS_MONTH") alert("You already used streak insurance this month.");
        else if (result.reason === "INSUFFICIENT_SAPPHIRES") alert(`You need ${STREAK_INSURANCE_COST} sapphires.`);
        else if (result.reason === "NO_STREAK") alert("You need an active streak first.");
        else alert("Could not apply streak insurance.");
        return;
      }

      setProfile((prev) => ({
        ...(prev ?? {}),
        sapphires: result.sapphiresLeft,
        lastPostRewardDate: yesterday,
        streakInsuranceMonthKey: today.slice(0, 7),
        streakInsuranceUsedAt: today,
      }));
      alert("Streak insurance applied. Post today to continue your streak.");
    } catch (error) {
      console.error(error);
      alert("Could not apply streak insurance.");
    } finally {
      setUsingInsurance(false);
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
                        src={matched.avatarUrl || resolveAvatar({ avatarSeed: matched.id }, matched.id)}
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

          <div className="flex gap-2">
            <button
              onClick={() => setFeedMode("for-you")}
              className={`rounded-lg px-3 py-1 text-xs ${
                feedMode === "for-you" ? "bg-[#ff6a00] text-white" : "border border-[#2f2f2f]"
              }`}
            >
              For You
            </button>
            <button
              onClick={() => setFeedMode("following")}
              className={`rounded-lg px-3 py-1 text-xs ${
                feedMode === "following" ? "bg-[#ff6a00] text-white" : "border border-[#2f2f2f]"
              }`}
            >
              Following
            </button>
          </div>

          <PostFeed
            searchTerm={searchTerm}
            readOnly={readOnlyMode}
            feedMode={feedMode}
            followingUsers={followingUsers}
            followingCommunities={followingCommunities}
            onToggleFollowAuthor={toggleFollowAuthor}
          />
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
              <p className="mt-1 text-xs text-gray-500">Rank: {levelTitle}</p>
              <p className="mt-1 text-xs text-gray-500">Login Streak: {profile?.loginStreak ?? 0} days</p>
              <div className="mt-3 rounded-lg border border-[#2a2a2a] bg-[#0e0e0e] p-2">
                <p className="text-[11px] text-gray-400">Streak Insurance ({STREAK_INSURANCE_COST} sapphires, once/month)</p>
                <button
                  type="button"
                  onClick={() => void handleUseStreakInsurance()}
                  disabled={!canUseInsurance || usingInsurance}
                  className="mt-2 w-full rounded border border-[#2f2f2f] px-2 py-1 text-xs text-gray-200 hover:border-[#ff6a00] disabled:opacity-50"
                >
                  {usingInsurance ? "Applying..." : "Protect Broken Streak"}
                </button>
                {!insuranceNeeded ? (
                  <p className="mt-1 text-[10px] text-gray-500">Available after you miss one day.</p>
                ) : monthlyInsuranceUsed ? (
                  <p className="mt-1 text-[10px] text-gray-500">Already used this month.</p>
                ) : sapphire < STREAK_INSURANCE_COST ? (
                  <p className="mt-1 text-[10px] text-gray-500">Need {STREAK_INSURANCE_COST} sapphires.</p>
                ) : (
                  <p className="mt-1 text-[10px] text-green-400">Ready to use.</p>
                )}
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
