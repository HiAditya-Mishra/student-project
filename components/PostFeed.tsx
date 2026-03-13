"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeHandle, resolveAvatar } from "@/lib/profile";
import { extractTopicTokens, getMentionContext, insertMention, MentionCandidate, MentionContext, rankMentionCandidate } from "@/lib/mentions";
import { rewardCommentCreate, rewardCommentUpvote, rewardHelpfulComment, rewardPostUpvote } from "@/lib/rewards";

interface Post {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  community: string;
  author: string;
  authorId?: string;
  authorHandle?: string;
  authorAvatarUrl?: string;
  authorLevel?: number;
  authorLevelTitle?: string;
  mentions?: string[];
  reached20Rewarded?: boolean;
  trendingRewarded?: boolean;
  likes: number;
  likedBy?: string[];
}

interface Comment {
  id: string;
  content: string;
  author: string;
  authorId?: string;
  authorHandle?: string;
  authorAvatarUrl?: string;
  authorLevel?: number;
  authorLevelTitle?: string;
  likes?: number;
  likedBy?: string[];
  helpful?: boolean;
  helpfulMarkedBy?: string;
}

type AuthorLite = {
  id: string;
  nickname: string;
  handle: string;
  avatarUrl?: string;
};

type UserSignal = {
  skills: string[];
  interests: string;
  followingCommunities: string[];
};

type PostFeedProps = {
  searchTerm?: string;
  readOnly?: boolean;
  feedMode?: "for-you" | "following";
  followingUsers?: string[];
  followingCommunities?: string[];
  onToggleFollowAuthor?: (authorId: string) => void | Promise<void>;
};

export default function PostFeed({
  searchTerm = "",
  readOnly = false,
  feedMode = "for-you",
  followingUsers = [],
  followingCommunities = [],
  onToggleFollowAuthor,
}: PostFeedProps) {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [authorsById, setAuthorsById] = useState<Record<string, AuthorLite>>({});
  const [authorsByHandle, setAuthorsByHandle] = useState<Record<string, AuthorLite>>({});
  const [feedError, setFeedError] = useState<string | null>(null);
  const [updatingPostId, setUpdatingPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, Comment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentMentionContext, setCommentMentionContext] = useState<Record<string, MentionContext | null>>({});
  const [commentMentionIndex, setCommentMentionIndex] = useState<Record<string, number>>({});
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState<string | null>(null);
  const [updatingCommentId, setUpdatingCommentId] = useState<string | null>(null);
  const [markingHelpfulCommentId, setMarkingHelpfulCommentId] = useState<string | null>(null);
  const [userSignalsById, setUserSignalsById] = useState<Record<string, UserSignal>>({});
  const commentListeners = useRef<Record<string, () => void>>({});
  const commentInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setFeedError(null);
        const fetchedPosts: Post[] = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Omit<Post, "id">),
        }));
        setPosts(fetchedPosts);

        const nextAuthorsById: Record<string, AuthorLite> = {};
        const nextAuthorsByHandle: Record<string, AuthorLite> = {};
        fetchedPosts.forEach((post) => {
          if (!post.authorId) return;
          const handle = normalizeHandle(post.authorHandle || post.author || "");
          const author: AuthorLite = {
            id: post.authorId,
            nickname: (post.author || "Spheera User").trim(),
            handle,
            avatarUrl: post.authorAvatarUrl,
          };
          nextAuthorsById[author.id] = author;
          nextAuthorsByHandle[author.handle] = author;
        });
        setAuthorsById(nextAuthorsById);
        setAuthorsByHandle(nextAuthorsByHandle);
      },
      (error) => {
        console.error(error);
        if (error.code === "permission-denied") {
          setFeedError("Firestore denied read access to posts. Update your Firestore Rules.");
          return;
        }
        setFeedError("Failed to load posts.");
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(commentListeners.current).forEach((unsubscribe) => unsubscribe());
      commentListeners.current = {};
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const next: Record<string, UserSignal> = {};
        snapshot.docs.forEach((docSnapshot) => {
          const data = docSnapshot.data() as {
            skills?: string[];
            interests?: string;
            followingCommunities?: string[];
          };
          next[docSnapshot.id] = {
            skills: Array.isArray(data.skills) ? data.skills.slice(0, 8) : [],
            interests: data.interests || "",
            followingCommunities: Array.isArray(data.followingCommunities) ? data.followingCommunities.slice(0, 30) : [],
          };
        });
        setUserSignalsById(next);
      },
      (error) => {
        console.error(error);
        setUserSignalsById({});
      },
    );

    return () => unsubscribe();
  }, []);

  const handleUpvote = async (postId: string) => {
    if (readOnly) return;
    const user = auth.currentUser;
    if (!user) {
      alert("Please login to upvote.");
      return;
    }

    try {
      setUpdatingPostId(postId);
      const postRef = doc(db, "posts", postId);
      let authorIdToReward = "";
      let crossed20 = false;
      let hitTrending = false;

      await runTransaction(db, async (transaction) => {
        const postSnap = await transaction.get(postRef);
        if (!postSnap.exists()) return;

        const data = postSnap.data() as Post;
        const likedBy = data.likedBy ?? [];
        if (likedBy.includes(user.uid)) return;
        const previousLikes = data.likes ?? 0;
        const nextLikes = previousLikes + 1;

        authorIdToReward = data.authorId || "";
        crossed20 = previousLikes < 20 && nextLikes >= 20 && !data.reached20Rewarded;
        hitTrending = previousLikes < 50 && nextLikes >= 50 && !data.trendingRewarded;
        transaction.update(postRef, {
          likes: nextLikes,
          likedBy: [...likedBy, user.uid],
          reached20Rewarded: data.reached20Rewarded || crossed20,
          trendingRewarded: data.trendingRewarded || hitTrending,
        });
      });

      if (authorIdToReward) {
        await rewardPostUpvote(authorIdToReward, { crossed20, trending: hitTrending });
      }
    } catch (error) {
      console.error(error);
      const message =
        typeof error === "object" && error && "code" in error && error.code === "permission-denied"
          ? "You do not have permission to upvote. Check Firestore Rules."
          : "Unable to upvote right now.";
      alert(message);
    } finally {
      setUpdatingPostId(null);
    }
  };

  const toggleComments = (postId: string) => {
    const nextOpen = !openComments[postId];
    setOpenComments((prev) => ({ ...prev, [postId]: nextOpen }));

    if (!nextOpen) {
      if (commentListeners.current[postId]) {
        commentListeners.current[postId]();
        delete commentListeners.current[postId];
      }
      return;
    }

    if (commentListeners.current[postId]) return;

    const commentsQuery = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(
      commentsQuery,
      (snapshot) => {
        const comments: Comment[] = snapshot.docs.map((commentSnapshot) => ({
          id: commentSnapshot.id,
          ...(commentSnapshot.data() as Omit<Comment, "id">),
        }));
        setCommentsByPost((prev) => ({ ...prev, [postId]: comments }));

        if (comments.length) {
          setAuthorsById((prev) => {
            const next = { ...prev };
            comments.forEach((comment) => {
              if (!comment.authorId) return;
              const handle = normalizeHandle(comment.authorHandle || comment.author || "");
              next[comment.authorId] = {
                id: comment.authorId,
                nickname: (comment.author || "Spheera User").trim(),
                handle,
                avatarUrl: comment.authorAvatarUrl,
              };
            });
            return next;
          });
          setAuthorsByHandle((prev) => {
            const next = { ...prev };
            comments.forEach((comment) => {
              if (!comment.authorId) return;
              const handle = normalizeHandle(comment.authorHandle || comment.author || "");
              next[handle] = {
                id: comment.authorId,
                nickname: (comment.author || "Spheera User").trim(),
                handle,
                avatarUrl: comment.authorAvatarUrl,
              };
            });
            return next;
          });
        }
      },
      (error) => {
        console.error(error);
        alert("Failed to load comments.");
      },
    );

    commentListeners.current[postId] = unsubscribe;
  };

  const submitComment = async (postId: string) => {
    if (readOnly) return;
    const user = auth.currentUser;
    if (!user) {
      alert("Please login to comment.");
      return;
    }

    const content = (commentDrafts[postId] ?? "").trim();
    if (!content) {
      alert("Write a comment first.");
      return;
    }

    try {
      setSubmittingCommentPostId(postId);
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));
      const profile = profileSnapshot.exists()
        ? profileSnapshot.data() as {
            nickname?: string;
            handle?: string;
            avatarUrl?: string;
            avatarSeed?: string;
            level?: number;
            levelTitle?: string;
          }
        : {};
      const nickname = (profile.nickname ?? "").trim();
      await addDoc(collection(db, "posts", postId, "comments"), {
        content,
        author: nickname || user.displayName || "Aspirant",
        authorId: user.uid,
        authorHandle: normalizeHandle(profile.handle || nickname || user.displayName || "Aspirant"),
        authorAvatarUrl: resolveAvatar(profile, user.uid),
        authorLevel: Number(profile.level ?? 1),
        authorLevelTitle: String(profile.levelTitle ?? "Fresher"),
        likes: 0,
        likedBy: [],
        helpful: false,
        helpfulMarkedBy: "",
        createdAt: serverTimestamp(),
      });
      await rewardCommentCreate(user.uid);

      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
    } catch (error) {
      console.error(error);
      alert("Unable to add comment right now.");
    } finally {
      setSubmittingCommentPostId(null);
    }
  };

  const handleCommentUpvote = async (postId: string, commentId: string) => {
    if (readOnly) return;
    const user = auth.currentUser;
    if (!user) {
      alert("Please login to upvote comments.");
      return;
    }

    try {
      setUpdatingCommentId(commentId);
      const commentRef = doc(db, "posts", postId, "comments", commentId);
      let commentAuthorId = "";
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(commentRef);
        if (!snapshot.exists()) return;

        const data = snapshot.data() as Comment;
        const likedBy = data.likedBy ?? [];
        if (likedBy.includes(user.uid)) return;
        commentAuthorId = data.authorId || "";

        transaction.update(commentRef, {
          likes: (data.likes ?? 0) + 1,
          likedBy: [...likedBy, user.uid],
        });
      });

      if (commentAuthorId) {
        await rewardCommentUpvote(commentAuthorId);
      }
    } catch (error) {
      console.error(error);
      alert("Unable to upvote comment right now.");
    } finally {
      setUpdatingCommentId(null);
    }
  };

  const handleMarkHelpful = async (post: Post, comment: Comment) => {
    if (readOnly) return;
    const user = auth.currentUser;
    if (!user) return;
    if (!post.authorId || post.authorId !== user.uid) {
      alert("Only the post author can mark comments helpful.");
      return;
    }
    if (comment.helpful) return;

    try {
      setMarkingHelpfulCommentId(comment.id);
      const commentRef = doc(db, "posts", post.id, "comments", comment.id);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(commentRef);
        if (!snapshot.exists()) return;
        const data = snapshot.data() as Comment;
        if (data.helpful) return;
        transaction.update(commentRef, {
          helpful: true,
          helpfulMarkedBy: user.uid,
        });
      });
      if (comment.authorId) {
        await rewardHelpfulComment(comment.authorId);
      }
    } catch (error) {
      console.error(error);
      alert("Unable to mark helpful right now.");
    } finally {
      setMarkingHelpfulCommentId(null);
    }
  };

  const handleDeletePost = async (post: Post) => {
    if (readOnly) return;
    const user = auth.currentUser;
    if (!user) {
      alert("Please login to delete posts.");
      return;
    }

    const isOwner = post.authorId === user.uid || (post.authorId == null && post.author === user.displayName);
    if (!isOwner) {
      alert("You can delete only your own posts.");
      return;
    }

    const confirmed = window.confirm("Delete this post? This cannot be undone.");
    if (!confirmed) return;

    try {
      setDeletingPostId(post.id);
      await deleteDoc(doc(db, "posts", post.id));
    } catch (error) {
      console.error(error);
      alert("Unable to delete post right now.");
    } finally {
      setDeletingPostId(null);
    }
  };

  const handleShare = async (postId: string) => {
    if (readOnly) return;
    const url = `${window.location.origin}/feed?post=${postId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Spheera post",
          text: "Check this post on Spheera",
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(url);
      alert("Post link copied.");
    } catch (error) {
      console.error(error);
      alert("Could not share this post.");
    }
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visiblePosts = posts.filter((post) => {
    if (feedMode === "following") {
      const followsAuthor = post.authorId ? followingUsers.includes(post.authorId) : false;
      const followsCommunity = followingCommunities.includes(post.community || "");
      if (!followsAuthor && !followsCommunity) return false;
    }
    if (!normalizedSearch) return true;
    const normalizedAuthorHandle = (post.authorHandle || "").toLowerCase();
    return (
      post.title?.toLowerCase().includes(normalizedSearch) ||
      post.content?.toLowerCase().includes(normalizedSearch) ||
      post.author?.toLowerCase().includes(normalizedSearch) ||
      normalizedAuthorHandle.includes(normalizedSearch.replace("@", "")) ||
      (post.mentions ?? []).some((mention) => mention.includes(normalizedSearch.replace("@", ""))) ||
      post.community?.toLowerCase().includes(normalizedSearch)
    );
  });

  const openProfile = (uid?: string) => {
    if (!uid) return;
    router.push(`/profile/${uid}`);
  };

  const renderTextWithMentions = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9._-]+)/g);
    return parts.map((part, index) => {
      const match = part.match(/^@([a-zA-Z0-9._-]+)$/);
      if (!match) {
        return <span key={`${part}-${index}`}>{part}</span>;
      }

      const handle = normalizeHandle(match[1]);
      const mentionUser = authorsByHandle[handle];
      const clickable = Boolean(mentionUser?.id);
      if (!clickable) {
        return (
          <span key={`${part}-${index}`} className="font-medium text-[#ffb380]">
            @{handle}
          </span>
        );
      }

      return (
        <Link
          key={`${part}-${index}`}
          href={`/profile/${mentionUser.id}`}
          className="font-semibold text-[#ff8c42] hover:underline"
        >
          @{handle}
        </Link>
      );
    });
  };

  const getCommentMentionOptions = (postId: string) => {
    const context = commentMentionContext[postId];
    if (!context) return [];
    const currentUserId = auth.currentUser?.uid || "";
    const post = posts.find((item) => item.id === postId);
    const postTopic = `${post?.title || ""} ${post?.content || ""}`;
    const draftTopic = commentDrafts[postId] ?? "";
    const topicTokens = extractTopicTokens(`${postTopic} ${draftTopic}`);
    const commenters = commentsByPost[postId] ?? [];
    const frequencyByAuthor: Record<string, number> = {};
    commenters.forEach((comment) => {
      if (!comment.authorId) return;
      frequencyByAuthor[comment.authorId] = (frequencyByAuthor[comment.authorId] ?? 0) + 1;
    });

    const token = context.query.trim();
    return Object.values(authorsById)
      .filter((user) => user.id !== currentUserId)
      .map((user) => {
        const signal = userSignalsById[user.id];
        const candidate: MentionCandidate = {
          id: user.id,
          nickname: user.nickname,
          handle: user.handle,
          avatar: user.avatarUrl || resolveAvatar({ avatarSeed: user.id }, user.id),
          skills: signal?.skills ?? [],
          interests: signal?.interests ?? "",
        };
        const interactionScore =
          (frequencyByAuthor[user.id] ?? 0) * 8 +
          (post?.authorId === user.id ? 10 : 0);
        const score = rankMentionCandidate({
          candidate,
          query: token,
          topicTokens,
          selectedCommunity: post?.community || "",
          candidateCommunities: signal?.followingCommunities ?? [],
          sharedCommunities: followingCommunities.filter((community) =>
            (signal?.followingCommunities ?? []).includes(community),
          ),
          interactionScore,
        });
        return { candidate, score };
      })
      .filter(({ candidate, score }) => {
        if (!token) return score > 0;
        if (candidate.handle.includes(token) || candidate.nickname.toLowerCase().includes(token)) return true;
        return score >= 30;
      })
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.candidate)
      .slice(0, 6);
  };

  const setCommentDraftWithMention = (postId: string, nextText: string, caret: number) => {
    setCommentDrafts((prev) => ({ ...prev, [postId]: nextText }));
    setCommentMentionContext((prev) => ({ ...prev, [postId]: getMentionContext(nextText, caret) }));
    setCommentMentionIndex((prev) => ({ ...prev, [postId]: 0 }));
  };

  const applyCommentMention = (postId: string, selectedHandle: string) => {
    const context = commentMentionContext[postId];
    if (!context) return;

    const draft = commentDrafts[postId] ?? "";
    const { nextText, caretIndex } = insertMention(draft, context, selectedHandle);

    setCommentDrafts((prev) => ({ ...prev, [postId]: nextText }));
    setCommentMentionContext((prev) => ({ ...prev, [postId]: null }));
    setCommentMentionIndex((prev) => ({ ...prev, [postId]: 0 }));

    requestAnimationFrame(() => {
      const input = commentInputRefs.current[postId];
      if (!input) return;
      input.focus();
      input.setSelectionRange(caretIndex, caretIndex);
    });
  };

  return (
    <div className="space-y-3">
      {feedError ? (
        <div className="rounded-xl border border-red-600/40 bg-red-950/30 p-3 text-sm text-red-200">
          {feedError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
      {visiblePosts.map((post) => (
        <article key={post.id} className="rounded-2xl border border-[#ff6a00] bg-[#141414] p-4 shadow-[0_0_14px_rgba(255,106,0,0.2)]">
          <div className="mb-3 flex items-center gap-2">
            <img
              src={post.authorAvatarUrl || authorsById[post.authorId ?? ""]?.avatarUrl || resolveAvatar({ avatarSeed: post.authorId || post.author || "user" }, post.authorId || post.author || "user")}
              alt={post.author}
              className="h-8 w-8 rounded-full border border-[#ff8c42]"
            />
            <div>
              <button
                type="button"
                onClick={() => openProfile(post.authorId)}
                className="text-left text-sm font-semibold text-[#ff8c42] hover:underline"
              >
                {post.author || "Aspirant"}
                {post.authorHandle ? <span className="ml-1 text-xs text-gray-400">@{post.authorHandle}</span> : null}
                <span className="ml-2 rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-[#5bc0ff]">
                  {post.authorLevelTitle || "Fresher"}
                </span>
              </button>
              {post.authorId && post.authorId !== auth.currentUser?.uid ? (
                <button
                  type="button"
                  onClick={() => onToggleFollowAuthor?.(post.authorId!)}
                  className="mt-1 rounded border border-[#2f2f2f] px-2 py-0.5 text-[10px] text-gray-300 hover:border-[#ff6a00]"
                >
                  {followingUsers.includes(post.authorId) ? "Following" : "Follow"}
                </button>
              ) : null}
              <p className="text-xs text-gray-500">{post.community || "general"}</p>
            </div>
          </div>

          <h3 className="text-xl font-semibold leading-tight text-white whitespace-pre-wrap break-words">
            {renderTextWithMentions(post.title)}
          </h3>
          <p className="mt-2 text-sm text-gray-300 whitespace-pre-wrap break-words">{renderTextWithMentions(post.content)}</p>
          {post.imageUrl ? (
            <img
              src={post.imageUrl}
              alt={post.title || "Post image"}
              className="mt-3 max-h-[380px] w-full rounded-xl border border-[#2f2f2f] bg-[#0f0f0f] object-cover"
            />
          ) : null}

          <div className="mt-4 flex items-center gap-3 text-xs text-gray-300">
            <button
              onClick={() => void handleUpvote(post.id)}
              disabled={
                readOnly ||
                updatingPostId === post.id ||
                (post.likedBy ?? []).includes(auth.currentUser?.uid ?? "")
              }
              className="rounded-lg bg-[#ff6a00] px-3 py-1 font-semibold text-white transition hover:bg-[#ff8c42] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {(post.likedBy ?? []).includes(auth.currentUser?.uid ?? "")
                ? `Upvoted ${post.likes ?? 0}`
                : `Upvote ${post.likes ?? 0}`}
            </button>
            <button
              onClick={() => toggleComments(post.id)}
              className="rounded-lg border border-[#2f2f2f] px-3 py-1 hover:border-[#ff6a00]"
            >
              Comment {commentsByPost[post.id]?.length ? `(${commentsByPost[post.id].length})` : ""}
            </button>
            <button
              onClick={() => void handleShare(post.id)}
              disabled={readOnly}
              className="rounded-lg border border-[#2f2f2f] px-3 py-1 hover:border-[#ff6a00]"
            >
              Share
            </button>
            {!readOnly && (post.authorId === auth.currentUser?.uid ||
              (post.authorId == null && post.author === auth.currentUser?.displayName)) ? (
              <button
                onClick={() => void handleDeletePost(post)}
                disabled={deletingPostId === post.id}
                className="rounded-lg border border-red-800/60 px-3 py-1 text-red-300 hover:border-red-500 disabled:opacity-60"
              >
                {deletingPostId === post.id ? "Deleting..." : "Delete"}
              </button>
            ) : null}
          </div>

          {openComments[post.id] ? (
            <div className="mt-4 space-y-3 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-3">
              <div className="space-y-2">
                {(commentsByPost[post.id] ?? []).length ? (
                  commentsByPost[post.id].map((comment) => (
                    <div key={comment.id} className="rounded-lg border border-[#222] bg-[#121212] px-3 py-2">
                      <button
                        type="button"
                        onClick={() => openProfile(comment.authorId)}
                        className="text-xs font-semibold text-[#ff8c42] hover:underline"
                      >
                        {comment.author || "Aspirant"}
                        {comment.authorHandle ? <span className="ml-1 text-[11px] text-gray-400">@{comment.authorHandle}</span> : null}
                        <span className="ml-2 rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-[#5bc0ff]">
                          {comment.authorLevelTitle || "Fresher"}
                        </span>
                      </button>
                      <p className="mt-1 text-sm text-gray-300 whitespace-pre-wrap break-words">{renderTextWithMentions(comment.content)}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => void handleCommentUpvote(post.id, comment.id)}
                          disabled={
                            readOnly ||
                            updatingCommentId === comment.id ||
                            (comment.likedBy ?? []).includes(auth.currentUser?.uid ?? "")
                          }
                          className="rounded border border-[#2f2f2f] px-2 py-1 text-[11px] text-gray-300 hover:border-[#ff6a00] disabled:opacity-60"
                        >
                          {(comment.likedBy ?? []).includes(auth.currentUser?.uid ?? "")
                            ? `Upvoted ${comment.likes ?? 0}`
                            : `Upvote ${comment.likes ?? 0}`}
                        </button>
                        <button
                          onClick={() => void handleMarkHelpful(post, comment)}
                          disabled={readOnly || comment.helpful || markingHelpfulCommentId === comment.id}
                          className="rounded border border-[#2f2f2f] px-2 py-1 text-[11px] text-green-300 hover:border-green-500 disabled:opacity-60"
                        >
                          {comment.helpful ? "Helpful" : "Mark Helpful"}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-500">No comments yet.</p>
                )}
              </div>

              {!readOnly ? (
                <div className="flex gap-2">
                  <input
                    ref={(node) => {
                      commentInputRefs.current[post.id] = node;
                    }}
                    value={commentDrafts[post.id] ?? ""}
                    onChange={(e) =>
                      setCommentDraftWithMention(post.id, e.target.value, e.target.selectionStart ?? e.target.value.length)
                    }
                    onKeyDown={(e) => {
                      const options = getCommentMentionOptions(post.id);
                      const context = commentMentionContext[post.id];
                      if (context && options.length) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setCommentMentionIndex((prev) => ({
                            ...prev,
                            [post.id]: ((prev[post.id] ?? 0) + 1) % options.length,
                          }));
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setCommentMentionIndex((prev) => ({
                            ...prev,
                            [post.id]: ((prev[post.id] ?? 0) - 1 + options.length) % options.length,
                          }));
                          return;
                        }
                        if (e.key === "Enter" || e.key === "Tab") {
                          e.preventDefault();
                          const selected = options[commentMentionIndex[post.id] ?? 0];
                          if (selected) applyCommentMention(post.id, selected.handle);
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setCommentMentionContext((prev) => ({ ...prev, [post.id]: null }));
                          return;
                        }
                      }

                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submitComment(post.id);
                      }
                    }}
                    placeholder="Write a comment..."
                    className="flex-1 rounded-lg border border-[#2f2f2f] bg-[#141414] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
                  />
                  <button
                    onClick={() => void submitComment(post.id)}
                    disabled={submittingCommentPostId === post.id}
                    className="rounded-lg bg-[#ff6a00] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {submittingCommentPostId === post.id ? "Posting..." : "Post"}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-500">Switch to Public Profile to add or upvote comments.</p>
              )}
              {commentMentionContext[post.id] && getCommentMentionOptions(post.id).length ? (
                <div className="rounded-lg border border-[#2f2f2f] bg-[#121212] p-1">
                  {getCommentMentionOptions(post.id).map((user, index) => (
                    <button
                      key={`${post.id}-${user.id}`}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyCommentMention(post.id, user.handle);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                        index === (commentMentionIndex[post.id] ?? 0) ? "bg-[#25160d]" : "hover:bg-[#1c1c1c]"
                      }`}
                    >
                      <img src={user.avatar} alt={user.nickname} className="h-6 w-6 rounded-full border border-[#ff8c42]" />
                      <span className="text-sm text-white">{user.nickname}</span>
                      <span className="text-xs text-gray-400">@{user.handle}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </article>
      ))}
      </div>
      {!feedError && !visiblePosts.length ? (
        <p className="rounded-xl border border-[#2b2b2b] bg-[#121212] p-3 text-sm text-gray-400">
          No posts found for "{searchTerm}".
        </p>
      ) : null}
    </div>
  );
}


