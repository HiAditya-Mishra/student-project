"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

interface Post {
  id: string;
  title: string;
  content: string;
  community: string;
  author: string;
  likes: number;
  likedBy?: string[];
}

function avatarFromName(name: string) {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(name)}`;
}

export default function PostFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [updatingPostId, setUpdatingPostId] = useState<string | null>(null);

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

  const handleUpvote = async (postId: string) => {
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

  return (
    <div className="space-y-3">
      {feedError ? (
        <div className="rounded-xl border border-red-600/40 bg-red-950/30 p-3 text-sm text-red-200">
          {feedError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
      {posts.map((post) => (
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
              <p className="text-xs text-gray-500">r/{post.community || "general"}</p>
            </div>
          </div>

          <h3 className="text-xl font-semibold leading-tight text-white">{post.title}</h3>
          <p className="mt-2 text-sm text-gray-300">{post.content}</p>

          <div className="mt-4 flex items-center gap-3 text-xs text-gray-300">
            <button
              onClick={() => void handleUpvote(post.id)}
              disabled={updatingPostId === post.id || (post.likedBy ?? []).includes(auth.currentUser?.uid ?? "")}
              className="rounded-lg bg-[#ff6a00] px-3 py-1 font-semibold text-white transition hover:bg-[#ff8c42] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {(post.likedBy ?? []).includes(auth.currentUser?.uid ?? "")
                ? `Upvoted ${post.likes ?? 0}`
                : `Upvote ${post.likes ?? 0}`}
            </button>
            <button className="rounded-lg border border-[#2f2f2f] px-3 py-1 hover:border-[#ff6a00]">
              Comment
            </button>
            <button className="rounded-lg border border-[#2f2f2f] px-3 py-1 hover:border-[#ff6a00]">
              Share
            </button>
          </div>
        </article>
      ))}
      </div>
    </div>
  );
}
