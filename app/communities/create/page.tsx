"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import { normalizeHandle } from "@/lib/profile";
import { arrayUnion, collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { useRouter } from "next/navigation";

type CommunityVisibility = "public" | "private" | "invite";

type UserCandidate = {
  id: string;
  nickname: string;
  handle: string;
};

type UserDocLite = {
  nickname?: string;
  handle?: string;
  followingCommunities?: string[];
};

function slugFromName(name: string) {
  return normalizeHandle(name).replace(/_/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40) || "community";
}

function generateInviteCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export default function CreateCommunityPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [visibility, setVisibility] = useState<CommunityVisibility>("public");
  const [rulesText, setRulesText] = useState("Be respectful\nNo spam\nNo harassment");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserCandidate[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Record<string, boolean>>({});
  const [selectedModerators, setSelectedModerators] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const next: UserCandidate[] = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data() as UserDocLite;
          return {
            id: docSnapshot.id,
            nickname: (data.nickname || "Campus User").trim(),
            handle: normalizeHandle(data.handle || data.nickname || "campus_user"),
          };
        });
        setUsers(next);
      },
      () => setUsers([]),
    );

    return () => unsubscribe();
  }, []);

  const filteredUsers = useMemo(() => {
    const token = query.trim().toLowerCase();
    if (!token) return users.slice(0, 50);
    return users
      .filter((user) => user.nickname.toLowerCase().includes(token) || user.handle.includes(token.replace("@", "")))
      .slice(0, 50);
  }, [users, query]);

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) => {
      const next = { ...prev, [userId]: !prev[userId] };
      if (!next[userId] && selectedModerators[userId]) {
        setSelectedModerators((mods) => ({ ...mods, [userId]: false }));
      }
      return next;
    });
  };

  const toggleModerator = (userId: string) => {
    if (!selectedMembers[userId]) return;
    setSelectedModerators((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const createUniqueCommunityId = async (base: string) => {
    let candidate = base;
    let suffix = 2;
    while (true) {
      const exists = await getDoc(doc(db, "communities", candidate));
      if (!exists.exists()) return candidate;
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      setError("Please login first.");
      return;
    }
    if (!name.trim() || !summary.trim()) {
      setError("Community name and summary are required.");
      return;
    }

    const parsedRules = rulesText
      .split("\n")
      .map((rule) => rule.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (!parsedRules.length) {
      setError("Add at least one community rule.");
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const baseId = slugFromName(name.trim());
      const communityId = await createUniqueCommunityId(baseId);

      const memberIds = Array.from(
        new Set([
          user.uid,
          ...Object.entries(selectedMembers)
            .filter(([, selected]) => selected)
            .map(([id]) => id),
        ]),
      );
      const modIds = Array.from(
        new Set([
          user.uid,
          ...Object.entries(selectedModerators)
            .filter(([, selected]) => selected)
            .map(([id]) => id)
            .filter((id) => memberIds.includes(id)),
        ]),
      );

      const batch = writeBatch(db);
      const communityRef = doc(db, "communities", communityId);
      batch.set(
        communityRef,
        {
          name: name.trim(),
          summary: summary.trim(),
          icon: name.trim().slice(0, 1).toUpperCase(),
          banner: visibility === "private"
            ? "linear-gradient(120deg, #24152c, #a266ff)"
            : "linear-gradient(120deg, #3b1d00, #ff6a00)",
          privacy: visibility,
          inviteCode: visibility === "invite" ? generateInviteCode() : "",
          rules: parsedRules,
          tags: [],
          events: [],
          modIds,
          ownerId: user.uid,
          bannedUserIds: [],
          memberIds,
          onlineMemberIds: [user.uid],
          membersCount: memberIds.length,
          onlineCount: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      memberIds.forEach((memberId) => {
        batch.set(
          doc(db, "users", memberId),
          {
            followingCommunities: arrayUnion(communityId),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      });

      await batch.commit();
      router.push(`/communities?created=${encodeURIComponent(communityId)}`);
    } catch (submitError) {
      console.error(submitError);
      setError("Could not create community. Check Firestore rules.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-[#2f2f2f] bg-[#141414] p-5">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-bold text-[#ff8c42]">Create Community</h1>
            <button
              type="button"
              onClick={() => router.push("/communities")}
              className="rounded-lg border border-[#2f2f2f] px-3 py-1.5 text-xs hover:border-[#ff6a00]"
            >
              Back
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-gray-400">Community Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. AI Builders Club"
                className="w-full rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-gray-400">Community Status</span>
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as CommunityVisibility)}
                className="w-full rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="invite">Invite Only</option>
              </select>
            </label>
          </div>

          {visibility === "invite" ? (
            <p className="text-xs text-[#ffb380]">
              Invite-only communities generate a private invite link after creation.
            </p>
          ) : null}

          <label className="space-y-1 block">
            <span className="text-xs text-gray-400">Summary</span>
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={3}
              placeholder="What is this community about?"
              className="w-full rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-xs text-gray-400">Community Rules (one per line)</span>
            <textarea
              value={rulesText}
              onChange={(event) => setRulesText(event.target.value)}
              rows={5}
              className="w-full rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
            />
          </label>

          <div className="rounded-xl border border-[#2a2a2a] bg-[#101010] p-3">
            <p className="text-sm font-semibold text-[#ff8c42]">Add Members and Moderators</p>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or @handle"
              className="mt-2 w-full rounded-lg border border-[#303030] bg-[#0f0f0f] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
            />

            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {filteredUsers.map((candidate) => (
                <div key={candidate.id} className="rounded-lg border border-[#262626] bg-[#141414] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{candidate.nickname}</p>
                      <p className="truncate text-xs text-gray-400">@{candidate.handle}</p>
                    </div>
                    <div className="flex gap-2">
                      {selectedMembers[candidate.id] ? (
                        <button
                          type="button"
                          onClick={() => toggleMember(candidate.id)}
                          className="rounded border border-[#ff6a00] bg-[#2a1608] px-2 py-1 text-[11px] text-[#ff8c42]"
                        >
                          Remove Member
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleMember(candidate.id)}
                          className="rounded border border-[#2f2f2f] px-2 py-1 text-[11px] text-gray-300"
                        >
                          Add Member
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleModerator(candidate.id)}
                        disabled={!selectedMembers[candidate.id]}
                        className={`rounded px-2 py-1 text-[11px] ${
                          selectedModerators[candidate.id]
                            ? "bg-[#5bc0ff] text-black"
                            : "border border-[#2f2f2f] text-gray-300"
                        } disabled:opacity-40`}
                      >
                        {selectedModerators[candidate.id] ? "Moderator" : "Make Mod"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!filteredUsers.length ? <p className="text-xs text-gray-500">No users found.</p> : null}
            </div>
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <button
            type="submit"
            disabled={creating}
            className="w-full rounded-xl bg-[#ff6a00] px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create Community"}
          </button>
        </form>
      </main>
    </div>
  );
}
