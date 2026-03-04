"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { normalizeHandle } from "@/lib/profile";
import { useRouter } from "next/navigation";

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
  memberIds?: string[];
  onlineMemberIds?: string[];
  modIds?: string[];
  bannedUserIds?: string[];
  events?: string[];
  ownerId?: string;
};

type Post = {
  id: string;
  title?: string;
  content?: string;
  imageUrl?: string;
  community?: string;
  likes?: number;
  authorId?: string;
  author?: string;
  createdAt?: { seconds?: number };
};

type Comment = {
  id: string;
  content?: string;
  author?: string;
  likes?: number;
};

type UserLite = {
  id: string;
  nickname: string;
  handle: string;
};

type UserDocLite = {
  nickname?: string;
  handle?: string;
  followingCommunities?: string[];
};

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
  const router = useRouter();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [selected, setSelected] = useState<string>("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [usersById, setUsersById] = useState<Record<string, UserLite>>({});
  const [tab, setTab] = useState<CommunityTab>("posts");
  const [sortMode, setSortMode] = useState<SortMode>("hot");
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [expandedPost, setExpandedPost] = useState<Post | null>(null);
  const [expandedPostComments, setExpandedPostComments] = useState<Comment[]>([]);

  useEffect(() => {
    let profileUnsub: (() => void) | null = null;
    const authUnsub = onAuthStateChanged(auth, (user) => {
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }

      if (!user) {
        setCurrentUserId("");
        setJoined({});
        return;
      }

      setCurrentUserId(user.uid);
      profileUnsub = onSnapshot(doc(db, "users", user.uid), (snapshot) => {
        const data = (snapshot.exists() ? snapshot.data() : {}) as UserDocLite;
        const following = data.followingCommunities ?? [];
        const next: Record<string, boolean> = {};
        following.forEach((communityId) => {
          next[communityId] = true;
        });
        setJoined(next);
      });
    });

    return () => {
      if (profileUnsub) profileUnsub();
      authUnsub();
    };
  }, []);

  useEffect(() => {
    const communitiesUnsub = onSnapshot(
      collection(db, "communities"),
      (snapshot) => {
        const remote: Community[] = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Omit<Community, "id">),
        }));

        const merged = new Map<string, Community>();
        remote.forEach((community) => {
          const base = merged.get(community.id) ?? ({ id: community.id } as Community);
          const memberIds = Array.isArray(community.memberIds) ? community.memberIds : base.memberIds ?? [];
          const onlineMemberIds = Array.isArray(community.onlineMemberIds)
            ? community.onlineMemberIds
            : base.onlineMemberIds ?? [];
          merged.set(community.id, {
            ...base,
            ...community,
            memberIds,
            onlineMemberIds,
            rules: community.rules ?? base.rules ?? [],
            tags: community.tags ?? base.tags ?? [],
            events: community.events ?? base.events ?? [],
            modIds: community.modIds ?? base.modIds ?? [],
            bannedUserIds: community.bannedUserIds ?? base.bannedUserIds ?? [],
          });
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

  useEffect(() => {
    const usersUnsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const next: Record<string, UserLite> = {};
      snapshot.docs.forEach((docSnapshot) => {
        const data = docSnapshot.data() as UserDocLite;
        next[docSnapshot.id] = {
          id: docSnapshot.id,
          nickname: (data.nickname || "Campus User").trim(),
          handle: normalizeHandle(data.handle || data.nickname || "campus_user"),
        };
      });
      setUsersById(next);
    });

    return () => usersUnsub();
  }, []);

  useEffect(() => {
    if (!communities.some((community) => community.id === selected) && communities.length) {
      setSelected(communities[0].id);
    }
  }, [communities, selected]);

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
      return items.sort(
        (a, b) =>
          (b.likes ?? 0) -
          (a.likes ?? 0) +
          ((b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)) / 3600,
      );
    }
    return items.sort(
      (a, b) =>
        (b.likes ?? 0) * 2 + (b.createdAt?.seconds ?? 0) / 3600 - ((a.likes ?? 0) * 2 + (a.createdAt?.seconds ?? 0) / 3600),
    );
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
  const isMod = Boolean(currentUserId && selectedCommunity?.modIds?.includes(currentUserId));
  const isJoinedSelected = Boolean(selectedCommunity && joined[selectedCommunity.id]);

  const getMembersCount = (community: Community) => {
    if (typeof community.membersCount === "number") return community.membersCount;
    if (community.memberIds?.length) return community.memberIds.length;
    return communityRealtimeStats[community.id]?.creators.size ?? 0;
  };

  const getOnlineCount = (community: Community) => {
    if (typeof community.onlineCount === "number") return community.onlineCount;
    if (community.onlineMemberIds?.length) return community.onlineMemberIds.length;
    return communityRealtimeStats[community.id]?.onlineCreators.size ?? 0;
  };

  const memberDirectory = useMemo(() => {
    const memberIds = selectedCommunity?.memberIds ?? [];
    const onlineIds = new Set(selectedCommunity?.onlineMemberIds ?? []);
    return memberIds.map((id) => {
      const profile = usersById[id];
      return {
        id,
        name: profile?.nickname || "Campus User",
        handle: profile?.handle || "campus_user",
        online: onlineIds.has(id),
      };
    });
  }, [selectedCommunity?.memberIds, selectedCommunity?.onlineMemberIds, usersById]);

  const onlineMembers = memberDirectory.filter((member) => member.online);

  useEffect(() => {
    if (!expandedPost?.id) {
      setExpandedPostComments([]);
      return;
    }

    const commentsQuery = query(collection(db, "posts", expandedPost.id, "comments"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(
      commentsQuery,
      (snapshot) => {
        setExpandedPostComments(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...(docSnapshot.data() as Omit<Comment, "id">),
          })),
        );
      },
      (error) => {
        console.error(error);
        setExpandedPostComments([]);
      },
    );

    return () => unsubscribe();
  }, [expandedPost?.id]);

  const toggleJoin = async () => {
    if (!currentUserId || !selectedCommunity) {
      alert("Please login first.");
      return;
    }
    if (joinBusy) return;

    try {
      setJoinBusy(true);
      const communityRef = doc(db, "communities", selectedCommunity.id);
      const userRef = doc(db, "users", currentUserId);

      await runTransaction(db, async (tx) => {
        const [communitySnap, userSnap] = await Promise.all([tx.get(communityRef), tx.get(userRef)]);

        const raw = (communitySnap.exists() ? communitySnap.data() : {}) as Partial<Community>;
        const currentMemberIds = Array.isArray(raw.memberIds) ? raw.memberIds : [];
        const currentOnlineIds = Array.isArray(raw.onlineMemberIds) ? raw.onlineMemberIds : [];
        const currentlyJoined = currentMemberIds.includes(currentUserId);

        const nextMemberIds = currentlyJoined
          ? currentMemberIds.filter((id) => id !== currentUserId)
          : Array.from(new Set([...currentMemberIds, currentUserId]));
        const nextOnlineIds = currentlyJoined
          ? currentOnlineIds.filter((id) => id !== currentUserId)
          : Array.from(new Set([...currentOnlineIds, currentUserId]));

        tx.set(
          communityRef,
          {
            memberIds: nextMemberIds,
            onlineMemberIds: nextOnlineIds,
            membersCount: nextMemberIds.length,
            onlineCount: nextOnlineIds.length,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        const userData = (userSnap.exists() ? userSnap.data() : {}) as UserDocLite;
        const following = Array.isArray(userData.followingCommunities) ? userData.followingCommunities : [];
        const nextFollowing = currentlyJoined
          ? following.filter((id) => id !== selectedCommunity.id)
          : Array.from(new Set([...following, selectedCommunity.id]));
        tx.set(
          userRef,
          {
            followingCommunities: nextFollowing,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      });
    } catch (error) {
      console.error(error);
      alert("Could not update membership.");
    } finally {
      setJoinBusy(false);
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
    if (userId === currentUserId) {
      alert("You cannot ban yourself.");
      return;
    }
    try {
      await updateDoc(doc(db, "communities", selectedCommunity.id), {
        bannedUserIds: arrayUnion(userId),
        memberIds: arrayRemove(userId),
        onlineMemberIds: arrayRemove(userId),
      });
    } catch (error) {
      console.error(error);
      alert("Could not ban user.");
    }
  };

  if (!selectedCommunity) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Navbar />
        <main className="mx-auto w-full max-w-7xl px-4 py-6">
          <div className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-6">
            <h1 className="text-xl font-bold text-[#ff8c42]">Communities</h1>
            <p className="mt-2 text-sm text-gray-400">No communities yet. Create your first community.</p>
            <button
              type="button"
              onClick={() => router.push("/communities/create")}
              className="mt-4 rounded-xl bg-[#ff6a00] px-4 py-2 text-sm font-semibold text-white"
            >
              Create Community
            </button>
          </div>
        </main>
      </div>
    );
  }

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
                <p className="mt-1 text-[11px] text-gray-500">Members: {getMembersCount(community)}</p>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => router.push("/communities/create")}
            className="w-full rounded-xl border border-[#ff6a00] bg-[#2a1608] px-3 py-2 text-sm font-semibold text-[#ff8c42] hover:bg-[#341b0a]"
          >
            Create Community
          </button>
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
                      {getMembersCount(selectedCommunity)} members | {getOnlineCount(selectedCommunity)} online
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => void toggleJoin()}
                  disabled={joinBusy}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                    isJoinedSelected ? "border border-white/70 bg-black/20" : "bg-[#ff6a00]"
                  }`}
                >
                  {joinBusy ? "Updating..." : isJoinedSelected ? "Leave" : "Join"}
                </button>
              </div>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-300">{selectedCommunity.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(selectedCommunity.tags ?? []).map((tag) => (
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
                  {(selectedCommunity.rules ?? []).map((rule, index) => (
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
                      <div className="flex gap-2">
                        <button
                          onClick={() => setExpandedPost(post)}
                          className="rounded border border-[#2f2f2f] px-2 py-1 text-[11px] text-gray-200 hover:border-[#ff6a00]"
                        >
                          Open
                        </button>
                        {isMod ? (
                          <button
                            onClick={() => void handleDeletePost(post.id)}
                            className="rounded border border-red-700 px-2 py-1 text-[11px] text-red-300"
                          >
                            Delete
                          </button>
                        ) : null}
                        {isMod && post.authorId && post.authorId !== currentUserId ? (
                          <button
                            onClick={() => void handleBanUser(post.authorId)}
                            className="rounded border border-yellow-700 px-2 py-1 text-[11px] text-yellow-300"
                          >
                            Ban
                          </button>
                        ) : null}
                      </div>
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
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{post.title || "Untitled Post"}</p>
                      <p className="text-xs text-gray-400">{post.likes ?? 0} upvotes</p>
                    </div>
                    <button
                      onClick={() => setExpandedPost(post)}
                      className="rounded border border-[#2f2f2f] px-2 py-1 text-[11px] text-gray-200 hover:border-[#ff6a00]"
                    >
                      Open
                    </button>
                  </div>
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
                <p className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-4 text-sm text-gray-500">No events yet.</p>
              )}
            </div>
          ) : null}

          {tab === "members" ? (
            <div className="space-y-2">
              <div className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-3">
                <p className="text-sm font-semibold text-[#ff8c42]">Online Members ({onlineMembers.length})</p>
                {onlineMembers.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {onlineMembers.map((member) => (
                      <span
                        key={`online-${member.id}`}
                        className="rounded-full border border-green-700/60 bg-green-950/40 px-2 py-1 text-xs text-green-300"
                      >
                        {member.name} @{member.handle}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">No online members right now.</p>
                )}
              </div>
              {memberDirectory.length ? (
                memberDirectory.map((member) => (
                  <div key={member.id} className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-3">
                    <p className="font-semibold">{member.name}</p>
                    <p className="text-xs text-gray-400">@{member.handle} | {member.online ? "Online" : "Offline"}</p>
                  </div>
                ))
              ) : (
                memberRows.map((member) => (
                  <div key={member.id} className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-3">
                    <p className="font-semibold">{member.name}</p>
                    <p className="text-xs text-gray-400">{member.posts} posts | {member.likes} likes</p>
                  </div>
                ))
              )}
              {!memberDirectory.length && !memberRows.length ? (
                <p className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-4 text-sm text-gray-500">No members yet.</p>
              ) : null}
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

      {expandedPost ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{expandedPost.title || "Untitled Post"}</p>
                <p className="text-xs text-gray-400">{expandedPost.author || "Aspirant"} | {expandedPost.likes ?? 0} upvotes</p>
              </div>
              <button
                onClick={() => setExpandedPost(null)}
                className="rounded-lg border border-[#2f2f2f] px-3 py-1 text-xs text-gray-300 hover:border-[#ff6a00]"
              >
                Close
              </button>
            </div>

            <p className="mt-3 whitespace-pre-wrap text-sm text-gray-200">{expandedPost.content || "No content."}</p>
            {expandedPost.imageUrl ? (
              <img
                src={expandedPost.imageUrl}
                alt={expandedPost.title || "Post image"}
                className="mt-3 max-h-[380px] w-full rounded-xl border border-[#2f2f2f] object-cover"
              />
            ) : null}

            <div className="mt-4">
              <p className="text-sm font-semibold text-[#ff8c42]">Comments ({expandedPostComments.length})</p>
              <div className="mt-2 space-y-2">
                {expandedPostComments.length ? (
                  expandedPostComments.map((comment) => (
                    <div key={comment.id} className="rounded-xl border border-[#2f2f2f] bg-[#101010] p-3">
                      <p className="text-xs text-[#ff8c42]">{comment.author || "Aspirant"}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-200">{comment.content || "..."}</p>
                      <p className="mt-1 text-[11px] text-gray-500">{comment.likes ?? 0} upvotes</p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-[#2f2f2f] bg-[#101010] p-3 text-sm text-gray-500">No comments yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
