"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import {
  arrayRemove,
  arrayUnion,
  addDoc,
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
type CommunityTab = "posts" | "trending" | "events" | "members" | "leaderboard" | "polls";
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
  inviteCode?: string;
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

type PollOption = {
  text: string;
  correct?: boolean;
};

type Poll = {
  id: string;
  type?: "poll" | "quiz";
  question?: string;
  subject?: string;
  tags?: string[];
  options?: PollOption[];
  authorId?: string;
  authorName?: string;
  createdAt?: { seconds?: number };
};

type PollResponse = {
  id: string;
  userId?: string;
  choiceIndex?: number;
  createdAt?: { seconds?: number };
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
  const [polls, setPolls] = useState<Poll[]>([]);
  const [pollsError, setPollsError] = useState<string | null>(null);
  const [selectedPollId, setSelectedPollId] = useState<string>("");
  const [pollResponses, setPollResponses] = useState<PollResponse[]>([]);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollSubject, setPollSubject] = useState("");
  const [pollTags, setPollTags] = useState("");
  const [pollType, setPollType] = useState<"poll" | "quiz">("poll");
  const [pollOptions, setPollOptions] = useState<string[]>(["", "", "", ""]);
  const [pollCorrectIndex, setPollCorrectIndex] = useState(0);
  const [pollPosting, setPollPosting] = useState(false);
  const [pollSubjectFilter, setPollSubjectFilter] = useState("");
  const [pollTagFilter, setPollTagFilter] = useState("");
  const [inviteUnlockedByCommunity, setInviteUnlockedByCommunity] = useState<Record<string, boolean>>({});
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState("");

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
          nickname: (data.nickname || "Spheera User").trim(),
          handle: normalizeHandle(data.handle || data.nickname || "spheera_user"),
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

  useEffect(() => {
    if (!selectedCommunity?.id) {
      setPolls([]);
      setSelectedPollId("");
      return;
    }

    const pollsRef = collection(db, "communities", selectedCommunity.id, "polls");
    const unsubscribe = onSnapshot(
      pollsRef,
      (snapshot) => {
        setPollsError(null);
        setPolls(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...(docSnapshot.data() as Omit<Poll, "id">),
          })),
        );
      },
      (error) => {
        console.error(error);
        setPollsError(
          error.code === "permission-denied"
            ? "Polls are blocked by Firestore rules."
            : "Failed to load polls.",
        );
        setPolls([]);
      },
    );

    return () => unsubscribe();
  }, [selectedCommunity?.id]);

  useEffect(() => {
    if (!selectedCommunity?.id || !selectedPollId) {
      setPollResponses([]);
      return;
    }

    const responsesRef = query(
      collection(db, "communities", selectedCommunity.id, "polls", selectedPollId, "responses"),
      orderBy("createdAt", "asc"),
    );
    const unsubscribe = onSnapshot(
      responsesRef,
      (snapshot) => {
        setPollResponses(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...(docSnapshot.data() as Omit<PollResponse, "id">),
          })),
        );
      },
      (error) => {
        console.error(error);
        setPollResponses([]);
      },
    );

    return () => unsubscribe();
  }, [selectedCommunity?.id, selectedPollId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = new URLSearchParams(window.location.search).get("invite") ?? "";
    setInviteToken(token);
    if (!token) return;
    const [communityId, code] = token.split(":");
    if (!communityId || !code) {
      setInviteNotice("Invite link is invalid.");
      return;
    }

    const target = communities.find((community) => community.id === communityId);
    if (!target) return;

    setSelected(communityId);
    if (!target.inviteCode || target.inviteCode !== code) {
      setInviteNotice("Invite code is invalid or expired.");
      return;
    }

    setInviteUnlockedByCommunity((prev) => ({ ...prev, [communityId]: true }));
    setInviteNotice(`Invite verified for ${target.name}. You can now join.`);
  }, [communities]);

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
  const isOwner = Boolean(currentUserId && selectedCommunity?.ownerId === currentUserId);
  const isMod = Boolean(currentUserId && selectedCommunity?.modIds?.includes(currentUserId));
  const isAdmin = isOwner || isMod;
  const isJoinedSelected = Boolean(selectedCommunity && joined[selectedCommunity.id]);
  const inviteUnlockedForSelected = Boolean(selectedCommunity && inviteUnlockedByCommunity[selectedCommunity.id]);

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
        name: profile?.nickname || "Spheera User",
        handle: profile?.handle || "spheera_user",
        online: onlineIds.has(id),
      };
    });
  }, [selectedCommunity?.memberIds, selectedCommunity?.onlineMemberIds, usersById]);

  const onlineMembers = memberDirectory.filter((member) => member.online);

  const sortedPolls = useMemo(() => {
    const subjectToken = pollSubjectFilter.trim().toLowerCase();
    const tagToken = pollTagFilter.trim().toLowerCase();
    return [...polls]
      .filter((poll) => {
        if (subjectToken && !(poll.subject || "").toLowerCase().includes(subjectToken)) return false;
        if (!tagToken) return true;
        return (poll.tags ?? []).some((tag) => tag.toLowerCase().includes(tagToken));
      })
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  }, [polls, pollSubjectFilter, pollTagFilter]);

  const selectedPoll = sortedPolls.find((poll) => poll.id === selectedPollId);

  useEffect(() => {
    setPollResponses([]);
  }, [selectedPollId]);

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

  const toggleJoin = async (options?: { communityId?: string; forceInviteAccess?: boolean }) => {
    const targetCommunityId = options?.communityId || selectedCommunity?.id;
    const targetCommunity = communities.find((community) => community.id === targetCommunityId) || selectedCommunity;
    if (!currentUserId || !targetCommunity || !targetCommunityId) {
      alert("Please login first.");
      return;
    }
    if (joinBusy) return;

    try {
      setJoinBusy(true);
      const communityRef = doc(db, "communities", targetCommunityId);
      const userRef = doc(db, "users", currentUserId);

      await runTransaction(db, async (tx) => {
        const [communitySnap, userSnap] = await Promise.all([tx.get(communityRef), tx.get(userRef)]);

        const raw = (communitySnap.exists() ? communitySnap.data() : {}) as Partial<Community>;
        const currentMemberIds = Array.isArray(raw.memberIds) ? raw.memberIds : [];
        const currentOnlineIds = Array.isArray(raw.onlineMemberIds) ? raw.onlineMemberIds : [];
        const currentlyJoined = currentMemberIds.includes(currentUserId);
        const privacy = raw.privacy || "public";
        const isTargetOwner = raw.ownerId === currentUserId;
        const isTargetMod = Array.isArray(raw.modIds) && raw.modIds.includes(currentUserId);
        const canBypassPrivacy = isTargetOwner || isTargetMod;
        const hasInviteAccess =
          options?.forceInviteAccess ||
          inviteUnlockedByCommunity[targetCommunityId] ||
          (raw.inviteCode && inviteToken === `${targetCommunityId}:${raw.inviteCode}`);

        if (!currentlyJoined) {
          if (privacy === "private" && !canBypassPrivacy) {
            throw new Error("PRIVATE_JOIN_BLOCKED");
          }
          if (privacy === "invite" && !canBypassPrivacy && !hasInviteAccess) {
            throw new Error("INVITE_REQUIRED");
          }
        }

        if (Array.isArray(raw.bannedUserIds) && raw.bannedUserIds.includes(currentUserId)) {
          throw new Error("BANNED_USER");
        }

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
          ? following.filter((id) => id !== targetCommunityId)
          : Array.from(new Set([...following, targetCommunityId]));
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
      const code = error instanceof Error ? error.message : "";
      if (code === "PRIVATE_JOIN_BLOCKED") {
        alert("Only creator/mods can add members in private communities.");
        return;
      }
      if (code === "INVITE_REQUIRED") {
        alert("This community needs a valid invite link.");
        return;
      }
      if (code === "BANNED_USER") {
        alert("You are banned from this community.");
        return;
      }
      alert("Could not update membership.");
    } finally {
      setJoinBusy(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, "posts", postId));
    } catch (error) {
      console.error(error);
      alert("Could not delete post.");
    }
  };

  const handleBanUser = async (userId?: string) => {
    if (!isAdmin || !userId || !selectedCommunity) return;
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

  const handleMakeModerator = async (userId: string) => {
    if (!isAdmin || !selectedCommunity || !userId) return;
    try {
      await updateDoc(doc(db, "communities", selectedCommunity.id), {
        modIds: arrayUnion(userId),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(error);
      alert("Could not promote user to moderator.");
    }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, "posts", postId, "comments", commentId));
    } catch (error) {
      console.error(error);
      alert("Could not delete comment.");
    }
  };

  const handleCopyInviteLink = async () => {
    if (!selectedCommunity || !isAdmin) return;
    const inviteCode = selectedCommunity.inviteCode;
    if (!inviteCode) {
      alert("Invite link is enabled only for invite-only communities.");
      return;
    }

    try {
      const link = `${window.location.origin}/communities?invite=${selectedCommunity.id}:${inviteCode}`;
      await navigator.clipboard.writeText(link);
      alert("Invite link copied.");
    } catch (error) {
      console.error(error);
      alert("Could not copy invite link.");
    }
  };

  const submitPoll = async (event: FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user || !selectedCommunity) {
      alert("Please login first.");
      return;
    }
    if (!pollQuestion.trim()) {
      alert("Question is required.");
      return;
    }
    const cleanedOptions = pollOptions.map((opt) => opt.trim()).filter(Boolean);
    if (cleanedOptions.length < 2) {
      alert("Add at least two options.");
      return;
    }

    try {
      setPollPosting(true);
      const options: PollOption[] = cleanedOptions.map((text, index) => ({
        text,
        correct: pollType === "quiz" ? index === pollCorrectIndex : false,
      }));
      await addDoc(collection(db, "communities", selectedCommunity.id, "polls"), {
        type: pollType,
        question: pollQuestion.trim(),
        subject: pollSubject.trim(),
        tags: pollTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 10),
        options,
        authorId: user.uid,
        authorName: user.displayName || "Spheera User",
        createdAt: serverTimestamp(),
      });
      setPollQuestion("");
      setPollSubject("");
      setPollTags("");
      setPollType("poll");
      setPollOptions(["", "", "", ""]);
      setPollCorrectIndex(0);
    } catch (error) {
      console.error(error);
      alert("Could not create poll.");
    } finally {
      setPollPosting(false);
    }
  };

  const submitPollResponse = async (choiceIndex: number) => {
    const user = auth.currentUser;
    if (!user || !selectedCommunity || !selectedPollId) {
      alert("Please login first.");
      return;
    }

    try {
      const existing = pollResponses.find((response) => response.userId === user.uid);
      if (existing) {
        await updateDoc(
          doc(db, "communities", selectedCommunity.id, "polls", selectedPollId, "responses", existing.id),
          {
            choiceIndex,
            updatedAt: serverTimestamp(),
          },
        );
        return;
      }
      await addDoc(collection(db, "communities", selectedCommunity.id, "polls", selectedPollId, "responses"), {
        userId: user.uid,
        choiceIndex,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(error);
      alert("Could not submit response.");
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
          <div className="rounded-xl border border-[#2f2f2f] bg-[#101010] p-3">
            <p className="text-sm font-semibold text-[#ff8c42]">Explore Communities</p>
            <p className="mt-1 text-xs text-gray-500">No community suggestions yet. Discovery algorithm is under development.</p>
          </div>
        </aside>

        <section className="space-y-4">
          {inviteNotice ? (
            <div className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-3 text-xs text-[#ffb380]">{inviteNotice}</div>
          ) : null}
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
                <div className="flex items-center gap-2">
                  {isAdmin ? (
                    <button
                      onClick={() => void handleCopyInviteLink()}
                      className="rounded-xl border border-[#2f2f2f] bg-black/25 px-3 py-2 text-xs text-gray-200 hover:border-[#ff6a00]"
                    >
                      Copy Invite Link
                    </button>
                  ) : null}
                  <button
                    onClick={() => void toggleJoin()}
                    disabled={
                      joinBusy ||
                      (!isJoinedSelected && selectedCommunity.privacy === "private" && !isAdmin) ||
                      (!isJoinedSelected && selectedCommunity.privacy === "invite" && !inviteUnlockedForSelected && !isAdmin)
                    }
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                      isJoinedSelected ? "border border-white/70 bg-black/20" : "bg-[#ff6a00]"
                    }`}
                  >
                    {joinBusy ? "Updating..." : isJoinedSelected ? "Leave" : "Join"}
                  </button>
                </div>
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
                  {(selectedCommunity.rules ?? []).slice(0, 6).map((rule, index) => (
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
              {(["posts", "trending", "events", "members", "leaderboard", "polls"] as CommunityTab[]).map((item) => (
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
                        {isAdmin ? (
                          <button
                            onClick={() => void handleDeletePost(post.id)}
                            className="rounded border border-red-700 px-2 py-1 text-[11px] text-red-300"
                          >
                            Delete
                          </button>
                        ) : null}
                        {isAdmin && post.authorId && post.authorId !== currentUserId ? (
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
                    {isAdmin && member.id !== currentUserId ? (
                      <div className="mt-2 flex gap-2">
                        {selectedCommunity.modIds?.includes(member.id) ? (
                          <span className="rounded border border-[#2f2f2f] px-2 py-1 text-[11px] text-[#7dd3fc]">Moderator</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleMakeModerator(member.id)}
                            className="rounded border border-[#2f2f2f] px-2 py-1 text-[11px] text-gray-300 hover:border-[#5bc0ff]"
                          >
                            Make Mod
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleBanUser(member.id)}
                          className="rounded border border-yellow-700 px-2 py-1 text-[11px] text-yellow-300"
                        >
                          Ban
                        </button>
                      </div>
                    ) : null}
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

          

          {tab === "polls" ? (
            <div className="space-y-4">
              {pollsError ? (
                <div className="rounded-xl border border-red-600/40 bg-red-950/30 p-3 text-sm text-red-200">
                  {pollsError}
                </div>
              ) : null}

              <form onSubmit={submitPoll} className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-[#ff8c42]">Create a Poll or Quiz</p>
                  <p className="text-xs text-gray-500">Low-effort questions that spark debate instantly.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPollType("poll")}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      pollType === "poll"
                        ? "border-[#ff6a00] bg-[#2a1608] text-[#ff8c42]"
                        : "border-[#2f2f2f] text-gray-300"
                    }`}
                  >
                    Poll
                  </button>
                  <button
                    type="button"
                    onClick={() => setPollType("quiz")}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      pollType === "quiz"
                        ? "border-[#ff6a00] bg-[#2a1608] text-[#ff8c42]"
                        : "border-[#2f2f2f] text-gray-300"
                    }`}
                  >
                    Quiz
                  </button>
                </div>
                <input
                  value={pollQuestion}
                  onChange={(event) => setPollQuestion(event.target.value)}
                  placeholder="Question (e.g. HC Verma vs DC Pandey?)"
                  className="w-full rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={pollSubject}
                    onChange={(event) => setPollSubject(event.target.value)}
                    placeholder="Subject (Physics, DSA, etc.)"
                    className="w-full rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
                  />
                  <input
                    value={pollTags}
                    onChange={(event) => setPollTags(event.target.value)}
                    placeholder="Tags (comma separated)"
                    className="w-full rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {pollOptions.map((option, index) => (
                    <div key={`option-${index}`} className="flex items-center gap-2">
                      <input
                        value={option}
                        onChange={(event) => {
                          const next = [...pollOptions];
                          next[index] = event.target.value;
                          setPollOptions(next);
                        }}
                        placeholder={`Option ${index + 1}`}
                        className="flex-1 rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
                      />
                      {pollType === "quiz" ? (
                        <button
                          type="button"
                          onClick={() => setPollCorrectIndex(index)}
                          className={`rounded-full border px-2 py-1 text-[10px] ${
                            pollCorrectIndex === index
                              ? "border-green-600/60 bg-green-950/40 text-green-300"
                              : "border-[#2f2f2f] text-gray-300"
                          }`}
                        >
                          {pollCorrectIndex === index ? "Correct" : "Mark"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={pollPosting}
                  className="rounded-lg bg-[#ff6a00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {pollPosting ? "Posting..." : pollType === "quiz" ? "Post Quiz" : "Post Poll"}
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#2f2f2f] bg-[#141414] p-3">
                <input
                  value={pollSubjectFilter}
                  onChange={(event) => setPollSubjectFilter(event.target.value)}
                  placeholder="Filter by subject"
                  className="min-w-[200px] flex-1 rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
                />
                <input
                  value={pollTagFilter}
                  onChange={(event) => setPollTagFilter(event.target.value)}
                  placeholder="Filter by tag"
                  className="min-w-[160px] flex-1 rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
                />
              </div>

              <div className="space-y-3">
                {sortedPolls.length ? (
                  sortedPolls.map((poll) => {
                    const isSelected = selectedPollId === poll.id;
                    const optionCount = poll.options?.length ?? 0;
                    return (
                      <div key={poll.id} className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-lg font-semibold text-white">{poll.question || "Untitled poll"}</p>
                            <p className="text-xs text-gray-500">
                              {poll.type === "quiz" ? "Quiz" : "Poll"} · {poll.subject || "General"} · {optionCount} options
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedPollId(isSelected ? "" : poll.id)}
                            className="rounded-lg border border-[#2f2f2f] px-3 py-1 text-xs text-gray-300 hover:border-[#ff6a00]"
                          >
                            {isSelected ? "Hide" : "Open"}
                          </button>
                        </div>

                        {poll.tags?.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {poll.tags.map((tag) => (
                              <span key={tag} className="rounded-md bg-[#2a1b12] px-2 py-1 text-xs text-[#ff8c42]">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        {isSelected ? (
                          <div className="mt-4 space-y-2 rounded-xl border border-[#262626] bg-[#101010] p-3">
                            {(() => {
                              const options = poll.options ?? [];
                              const counts = options.map(() => 0);
                              pollResponses.forEach((response) => {
                                const idx = response.choiceIndex ?? -1;
                                if (idx >= 0 && idx < counts.length) counts[idx] += 1;
                              });
                              const total = counts.reduce((a, b) => a + b, 0);
                              const userResponse = pollResponses.find((response) => response.userId === currentUserId);

                              return (
                                <>
                                  {options.map((option, index) => {
                                    const percent = total ? Math.round((counts[index] / total) * 100) : 0;
                                    const isCorrect = poll.type === "quiz" && option.correct;
                                    const isChosen = userResponse?.choiceIndex === index;
                                    return (
                                      <button
                                        key={`${poll.id}-${index}`}
                                        type="button"
                                        onClick={() => void submitPollResponse(index)}
                                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                                          isChosen
                                            ? "border-[#ff6a00] bg-[#1f120a]"
                                            : "border-[#2f2f2f] bg-[#141414]"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span>{option.text}</span>
                                          <span className="text-xs text-gray-400">{percent}%</span>
                                        </div>
                                        <div className="mt-1 h-1 w-full rounded-full bg-[#1a1a1a]">
                                          <div
                                            className={`h-1 rounded-full ${isCorrect ? "bg-green-500/70" : "bg-[#ff6a00]"}`}
                                            style={{ width: `${percent}%` }}
                                          />
                                        </div>
                                        {poll.type === "quiz" && isCorrect ? (
                                          <span className="mt-1 inline-block text-[11px] text-green-300">Correct answer</span>
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </>
                              );
                            })()}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-4 text-sm text-gray-500">
                    No polls yet. Start the debate.
                  </p>
                )}
              </div>
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
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => void handleDeleteComment(expandedPost.id, comment.id)}
                          className="mt-2 rounded border border-red-700 px-2 py-1 text-[11px] text-red-300"
                        >
                          Delete Message
                        </button>
                      ) : null}
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


