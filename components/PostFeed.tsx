"use client";

import { useEffect, useRef, useState } from "react";
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

interface Post {
  id: string;
  title: string;
  content: string;
  community: string;
  author: string;
  authorId?: string;
  likes: number;
  likedBy?: string[];
}

interface Comment {
  id: string;
  content: string;
  author: string;
  authorId?: string;
}

function avatarFromName(name: string) {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(name)}`;
}

type PostFeedProps = {
  searchTerm?: string;
  readOnly?: boolean;
};

export default function PostFeed({ searchTerm = "", readOnly = false }: PostFeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [updatingPostId, setUpdatingPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, Comment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState<string | null>(null);
  const commentListeners = useRef<Record<string, () => void>>({});

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

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      Object.values(commentListeners.current).forEach((unsubscribe) => unsubscribe());
      commentListeners.current = {};
    };
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
      await runTransaction(db, async (transaction) => {
        const postSnap = await transaction.get(postRef);
        if (!postSnap.exists()) return;

        const data = postSnap.data() as Post;
        const likedBy = data.likedBy ?? [];
        if (likedBy.includes(user.uid)) return;

        transaction.update(postRef, {
          likes: (data.likes ?? 0) + 1,
          likedBy: [...likedBy, user.uid],
        });
      });
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
    if (readOnly) return;
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
      const nickname = profileSnapshot.exists()
        ? ((profileSnapshot.data() as { nickname?: string }).nickname ?? "").trim()
        : "";
      await addDoc(collection(db, "posts", postId, "comments"), {
        content,
        author: nickname || user.displayName || "Aspirant",
        authorId: user.uid,
        createdAt: serverTimestamp(),
      });

      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
    } catch (error) {
      console.error(error);
      alert("Unable to add comment right now.");
    } finally {
      setSubmittingCommentPostId(null);
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
          title: "CampusSphere post",
          text: "Check this post on CampusSphere",
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
    if (!normalizedSearch) return true;
    return (
      post.title?.toLowerCase().includes(normalizedSearch) ||
      post.content?.toLowerCase().includes(normalizedSearch) ||
      post.author?.toLowerCase().includes(normalizedSearch) ||
      post.community?.toLowerCase().includes(normalizedSearch)
    );
  });

  return (
    <div className="space-y-3">
      {feedError ? (
        <div className="rounded-xl border border-red-600/40 bg-red-950/30 p-3 text-sm text-red-200">
          {feedError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
      {visiblePosts.map((post) => (
        <article
          key={post.id}
          className="rounded-2xl border border-[#ff6a00] bg-[#141414] p-4 shadow-[0_0_14px_rgba(255,106,0,0.2)]"
        >
          <div className="mb-3 flex items-center gap-2">
            <img
              src={avatarFromName(post.author || "user")}
              alt={post.author}
              className="h-8 w-8 rounded-full border border-[#ff8c42]"
            />
            <div>
              <p className="text-sm font-semibold text-[#ff8c42]">{post.author || "Aspirant"}</p>
              <p className="text-xs text-gray-500">{post.community || "general"}</p>
            </div>
          </div>

          <h3 className="text-xl font-semibold leading-tight text-white">{post.title}</h3>
          <p className="mt-2 text-sm text-gray-300">{post.content}</p>

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
              disabled={readOnly}
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

          {!readOnly && openComments[post.id] ? (
            <div className="mt-4 space-y-3 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-3">
              <div className="space-y-2">
                {(commentsByPost[post.id] ?? []).length ? (
                  commentsByPost[post.id].map((comment) => (
                    <div key={comment.id} className="rounded-lg border border-[#222] bg-[#121212] px-3 py-2">
                      <p className="text-xs font-semibold text-[#ff8c42]">{comment.author || "Aspirant"}</p>
                      <p className="mt-1 text-sm text-gray-300">{comment.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-500">No comments yet.</p>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  value={commentDrafts[post.id] ?? ""}
                  onChange={(e) =>
                    setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                  }
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
