"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

type PrivacyType = "public" | "private" | "invite";
type CommunityTab = "posts" | "trending" | "events" | "members" | "leaderboard";
type SortMode = "hot" | "new" | "top" | "rising";

type Community = {
  id: string;
  name: string;
  icon?: string;
  banner?: string;
  summary: string;
  rules: string[];
  tags: string[];
  privacy?: PrivacyType;
  membersCount?: number;
  onlineCount?: number;
  modIds?: string[];
  bannedUserIds?: string[];
  events?: string[];
};

type Post = {
  id: string;
  title?: string;
  community?: string;
  likes?: number;
  authorId?: string;
  author?: string;
  createdAt?: { seconds?: number };
};

const defaultCommunities: Community[] = [
  {
    id: "general",
    name: "General",
    icon: "G",
    summary: "Open forum for campus life, announcements, and questions.",
    banner: "linear-gradient(120deg, #4f2a00, #ff6a00)",
    rules: ["Be respectful", "No spam", "Use clear titles"],
    tags: ["Campus", "Announcements"],
    privacy: "public",
  },
  {
    id: "coding",
    name: "Coding",
    icon: "C",
    summary: "Debug help, hackathon prep, projects, and internship tips.",
    banner: "linear-gradient(120deg, #032744, #0088ff)",
    rules: ["Share context in questions", "No plagiarism", "Use code blocks"],
    tags: ["Programming", "Hackathons"],
    privacy: "public",
  },
  {
    id: "study",
    name: "Study",
    icon: "S",
    summary: "Daily accountability, exam prep, and study-room coordination.",
    banner: "linear-gradient(120deg, #124107, #39cc00)",
    rules: ["No cheating discussions", "Stay on-topic", "Encourage others"],
    tags: ["Productivity", "Exams"],
    privacy: "public",
  },
];

function privacyLabel(privacy?: PrivacyType) {
  if (privacy === "private") return "Private";
  if (privacy === "invite") return "Invite Only";
  return "Public";
}

function privacyIcon(privacy?: PrivacyType) {
  if (privacy === "private") return "LOCK";
  if (privacy === "invite") return "KEY";
  return "OPEN";
}

export default function CommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>(defaultCommunities);
  const [joined, setJoined] = useState<Record<string, boolean>>({ general: true });
  const [selected, setSelected] = useState<string>("general");
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<CommunityTab>("posts");
  const [sortMode, setSortMode] = useState<SortMode>("hot");
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [creatingCommunity, setCreatingCommunity] = useState(false);
  const [newCommunityName, setNewCommunityName] = useState("");
  const [newCommunitySummary, setNewCommunitySummary] = useState("");
  const [newCommunityPrivacy, setNewCommunityPrivacy] = useState<PrivacyType>("public");

  useEffect(() => {
    const communitiesUnsub = onSnapshot(
      collection(db, "communities"),
      (snapshot) => {
        const remote: Community[] = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Omit<Community, "id">),
        }));

        // Merge by id so backend values override local defaults when present.
        const merged = new Map<string, Community>();
        defaultCommunities.forEach((community) => merged.set(community.id, community));
        remote.forEach((community) => {
          const base = merged.get(community.id) ?? { id: community.id } as Community;
          merged.set(community.id, { ...base, ...community });
        });
        setCommunities(Array.from(merged.values()));
      },
      (error) => {
        console.error(error);
      },
    );

    const postsQuery = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const postsUnsub = onSnapshot(
      postsQuery,
      (snapshot) => {
        setCommunityError(null);
        const nextPosts: Post[] = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Omit<Post, "id">),
        }));
        setPosts(nextPosts);
      },
      (error) => {
        console.error(error);
        setCommunityError(
          error.code === "permission-denied"
            ? "Community data is blocked by Firestore rules."
            : "Failed to load community posts.",
        );
        setPosts([]);
      },
    );

    return () => {
      communitiesUnsub();
      postsUnsub();
    };
  }, []);

  const selectedCommunity = useMemo(
    () => communities.find((community) => community.id === selected) ?? communities[0],
    [communities, selected],
  );

  const filteredCommunityPosts = useMemo(
    () => posts.filter((post) => post.community === selectedCommunity?.id),
    [posts, selectedCommunity?.id],
  );

  const communityRealtimeStats = useMemo(() => {
    const statsByCommunity: Record<string, { creators: Set<string>; onlineCreators: Set<string> }> = {};
    const now = Math.floor(Date.now() / 1000);
    posts.forEach((post) => {
      const communityId = post.community || "general";
      if (!statsByCommunity[communityId]) {
        statsByCommunity[communityId] = { creators: new Set<string>(), onlineCreators: new Set<string>() };
      }
      if (post.authorId) {
        statsByCommunity[communityId].creators.add(post.authorId);
        const age = now - (post.createdAt?.seconds ?? 0);
        // "Online" proxy: users active in this community in the last 30 minutes.
        if (age <= 30 * 60) {
          statsByCommunity[communityId].onlineCreators.add(post.authorId);
        }
      }
    });
    return statsByCommunity;
  }, [posts]);

  const sortedPosts = useMemo(() => {
    const items = [...filteredCommunityPosts];
    if (sortMode === "new") {
      return items.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    }
    if (sortMode === "top") {
      return items.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
    }
    if (sortMode === "rising") {
      return items.sort((a, b) => ((b.likes ?? 0) - (a.likes ?? 0)) + ((b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)) / 3600);
    }
    return items.sort((a, b) => ((b.likes ?? 0) * 2 + (b.createdAt?.seconds ?? 0) / 3600) - ((a.likes ?? 0) * 2 + (a.createdAt?.seconds ?? 0) / 3600));
  }, [filteredCommunityPosts, sortMode]);

  const trendingPosts = sortedPosts.slice(0, 5);

  const memberRows = useMemo(() => {
    const unique = new Map<string, { id: string; name: string; posts: number; likes: number }>();
    filteredCommunityPosts.forEach((post) => {
      const id = post.authorId || "unknown";
      const previous = unique.get(id) || { id, name: post.author || "Aspirant", posts: 0, likes: 0 };
      previous.posts += 1;
      previous.likes += post.likes ?? 0;
      unique.set(id, previous);
    });
    return Array.from(unique.values());
  }, [filteredCommunityPosts]);

  const leaderboard = [...memberRows].sort((a, b) => b.likes - a.likes).slice(0, 10);
  const isMod = Boolean(auth.currentUser && selectedCommunity?.modIds?.includes(auth.currentUser.uid));

  const toggleJoin = async () => {
    const user = auth.currentUser;
    if (!user || !selectedCommunity) {
      alert("Please login first.");
      return;
    }
    const isJoined = joined[selectedCommunity.id];
    setJoined((prev) => ({ ...prev, [selectedCommunity.id]: !isJoined }));

    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          followingCommunities: isJoined
            ? arrayRemove(selectedCommunity.id)
            : arrayUnion(selectedCommunity.id),
        },
        { merge: true },
      );
      const communityRef = doc(db, "communities", selectedCommunity.id);
      await setDoc(
        communityRef,
        {
          membersCount: (selectedCommunity.membersCount ?? 0) + (isJoined ? -1 : 1),
        },
        { merge: true },
      );
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreateCommunity = async (event: FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first.");
      return;
    }
    if (!newCommunityName.trim() || !newCommunitySummary.trim()) {
      alert("Name and summary are required.");
      return;
    }

    try {
      setCreatingCommunity(true);
      await addDoc(collection(db, "communities"), {
        name: newCommunityName.trim(),
        summary: newCommunitySummary.trim(),
        icon: newCommunityName.trim().slice(0, 1).toUpperCase(),
        banner: "linear-gradient(120deg, #3b1d00, #ff6a00)",
        rules: ["Be respectful", "No spam", "No harassment"],
        tags: ["Student"],
        privacy: newCommunityPrivacy,
        membersCount: 1,
        onlineCount: 1,
        modIds: [user.uid],
        bannedUserIds: [],
        events: [],
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
      setNewCommunityName("");
      setNewCommunitySummary("");
      setNewCommunityPrivacy("public");
    } catch (error) {
      console.error(error);
      alert("Could not create community. Check Firestore rules.");
    } finally {
      setCreatingCommunity(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!isMod) return;
    try {
      await deleteDoc(doc(db, "posts", postId));
    } catch (error) {
      console.error(error);
      alert("Could not delete post.");
    }
  };

  const handleBanUser = async (userId?: string) => {
    if (!isMod || !userId || !selectedCommunity) return;
    try {
      await updateDoc(doc(db, "communities", selectedCommunity.id), {
        bannedUserIds: arrayUnion(userId),
      });
    } catch (error) {
      console.error(error);
      alert("Could not ban user.");
    }
  };

  if (!selectedCommunity) return null;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[300px_1fr]">
        {communityError ? (
          <div className="lg:col-span-2 rounded-xl border border-red-600/40 bg-red-950/30 p-3 text-sm text-red-200">
            {communityError}
          </div>
        ) : null}

        <aside className="space-y-3 rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
          <h2 className="text-lg font-bold text-[#ff8c42]">Communities</h2>
          <div className="space-y-2">
            {communities.map((community) => (
              <button
                key={community.id}
                onClick={() => setSelected(community.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selected === community.id
                    ? "border-[#ff6a00] bg-[#1a120c]"
                    : "border-[#2f2f2f] bg-[#101010] hover:border-[#ff6a00]"
                }`}
              >
                    <p className="text-sm font-semibold">{community.name}</p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {privacyIcon(community.privacy)} {privacyLabel(community.privacy)}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-500">
                      Members: {community.membersCount ?? communityRealtimeStats[community.id]?.creators.size ?? 0}
                    </p>
                  </button>
                ))}
              </div>

          <form onSubmit={handleCreateCommunity} className="space-y-2 rounded-xl border border-[#2a2a2a] bg-[#101010] p-3">
            <p className="text-xs font-semibold text-[#ff8c42]">Create Community</p>
            <input
              value={newCommunityName}
              onChange={(event) => setNewCommunityName(event.target.value)}
              placeholder="Name"
              className="w-full rounded border border-[#303030] bg-[#151515] px-2 py-1.5 text-xs"
            />
            <input
              value={newCommunitySummary}
              onChange={(event) => setNewCommunitySummary(event.target.value)}
              placeholder="Summary"
              className="w-full rounded border border-[#303030] bg-[#151515] px-2 py-1.5 text-xs"
            />
            <select
              value={newCommunityPrivacy}
              onChange={(event) => setNewCommunityPrivacy(event.target.value as PrivacyType)}
              className="w-full rounded border border-[#303030] bg-[#151515] px-2 py-1.5 text-xs"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="invite">Invite Only</option>
            </select>
            <button
              type="submit"
              disabled={creatingCommunity}
              className="w-full rounded bg-[#ff6a00] px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            >
              {creatingCommunity ? "Creating..." : "Create"}
            </button>
          </form>
        </aside>

        <section className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-[#2f2f2f] bg-[#141414]">
            <div className="h-24 px-5 py-4" style={{ background: selectedCommunity.banner }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-black/30 text-center text-xl font-bold leading-10">
                    {selectedCommunity.icon || selectedCommunity.name.slice(0, 1)}
                  </div>
                  <div>
                    <h1 className="text-xl font-bold">{selectedCommunity.name}</h1>
                    <p className="text-xs text-white/80">
                      {selectedCommunity.membersCount ?? communityRealtimeStats[selectedCommunity.id]?.creators.size ?? 0} members
                      {" | "}
                      {selectedCommunity.onlineCount ?? communityRealtimeStats[selectedCommunity.id]?.onlineCreators.size ?? 0} online
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => void toggleJoin()}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                    joined[selectedCommunity.id] ? "border border-white/70 bg-black/20" : "bg-[#ff6a00]"
                  }`}
                >
                  {joined[selectedCommunity.id] ? "Leave" : "Join"}
                </button>
              </div>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-300">{selectedCommunity.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedCommunity.tags.map((tag) => (
                  <span key={tag} className="rounded-md bg-[#2a1b12] px-2 py-1 text-xs text-[#ff8c42]">
                    {tag}
                  </span>
                ))}
              </div>

              <button
                onClick={() => setRulesExpanded((prev) => !prev)}
                className="mt-4 rounded-lg border border-[#2f2f2f] px-3 py-1.5 text-xs hover:border-[#ff6a00]"
              >
                {rulesExpanded ? "Hide Rules" : "Show Rules"}
              </button>
              {rulesExpanded ? (
                <ol className="mt-2 space-y-1 text-sm text-gray-300">
                  {selectedCommunity.rules.map((rule, index) => (
                    <li key={rule} className="rounded-lg border border-[#2a2a2a] bg-[#101010] px-3 py-2">
                      {index + 1}. {rule}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#2f2f2f] bg-[#141414] p-3">
            <div className="flex flex-wrap gap-2">
              {(["posts", "trending", "events", "members", "leaderboard"] as CommunityTab[]).map((item) => (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  className={`rounded-lg px-3 py-1 text-xs ${tab === item ? "bg-[#ff6a00]" : "border border-[#2f2f2f]"}`}
                >
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>
            <div className="text-xs">
              Sort:
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="ml-2 rounded border border-[#2f2f2f] bg-[#101010] px-2 py-1"
              >
                <option value="hot">Hot</option>
                <option value="new">New</option>
                <option value="top">Top</option>
                <option value="rising">Rising</option>
              </select>
            </div>
          </div>

          {tab === "posts" ? (
            <div className="space-y-2">
              {sortedPosts.length ? (
                sortedPosts.map((post) => (
                  <div key={post.id} className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{post.title || "Untitled Post"}</p>
                        <p className="text-xs text-gray-400">{post.author || "Aspirant"} | {post.likes ?? 0} upvotes</p>
                      </div>
                      {isMod ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => void handleDeletePost(post.id)}
                            className="rounded border border-red-700 px-2 py-1 text-[11px] text-red-300"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => void handleBanUser(post.authorId)}
                            className="rounded border border-yellow-700 px-2 py-1 text-[11px] text-yellow-300"
                          >
                            Ban
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-4 text-sm text-gray-500">No posts yet.</p>
              )}
            </div>
          ) : null}

          {tab === "trending" ? (
            <div className="space-y-2">
              {trendingPosts.map((post) => (
                <div key={post.id} className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-3">
                  <p className="font-semibold">{post.title || "Untitled Post"}</p>
                  <p className="text-xs text-gray-400">{post.likes ?? 0} upvotes</p>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "events" ? (
            <div className="space-y-2">
              {(selectedCommunity.events ?? []).length ? (
                (selectedCommunity.events ?? []).map((event) => (
                  <div key={event} className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-3 text-sm">
                    {event}
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-4 text-sm text-gray-500">
                  No events yet.
                </p>
              )}
            </div>
          ) : null}

          {tab === "members" ? (
            <div className="space-y-2">
              {memberRows.map((member) => (
                <div key={member.id} className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-3">
                  <p className="font-semibold">{member.name}</p>
                  <p className="text-xs text-gray-400">{member.posts} posts | {member.likes} likes</p>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "leaderboard" ? (
            <div className="space-y-2">
              {leaderboard.map((entry, index) => (
                <div key={entry.id} className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-3">
                  <p className="font-semibold">#{index + 1} {entry.name}</p>
                  <p className="text-xs text-gray-400">{entry.likes} likes earned</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
