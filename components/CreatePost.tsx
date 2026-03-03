"use client";

import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type CreatePostProps = {
  mode?: "full" | "compact";
};

export default function CreatePost({ mode = "full" }: CreatePostProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [community, setCommunity] = useState("general");
  const [loading, setLoading] = useState(false);

  const isCompact = mode === "compact";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !content.trim()) {
      alert("Fill all fields");
      return;
    }

    if (!auth.currentUser) {
      alert("Please login to create a post.");
      return;
    }

    try {
      setLoading(true);
      await addDoc(collection(db, "posts"), {
        title: title.trim(),
        content: content.trim(),
        community,
        author: auth.currentUser?.displayName || "Aspirant",
        createdAt: serverTimestamp(),
        likes: 0,
        likedBy: [],
      });

      setTitle("");
      setContent("");
      setCommunity("general");
    } catch (error) {
      console.error(error);
      const message =
        typeof error === "object" && error && "code" in error && error.code === "permission-denied"
          ? "You do not have permission to create posts. Check Firestore Rules."
          : "Error creating post";
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border border-[#2d2d2d] bg-[#141414] p-4 shadow-[0_0_20px_rgba(255,106,0,0.08)] ${
        isCompact ? "" : "mb-6"
      }`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {!isCompact ? (
          <h2 className="text-base font-semibold text-[#ff8c42]">Create Post</h2>
        ) : null}

        <input
          type="text"
          placeholder="Post title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-xl border border-[#313131] bg-[#0f0f0f] px-3 py-2 text-sm outline-none placeholder:text-gray-500 focus:border-[#ff6a00]"
        />

        <textarea
          placeholder={isCompact ? "Add a post..." : "Write something..."}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className={`rounded-xl border border-[#313131] bg-[#0f0f0f] px-3 py-2 text-sm outline-none placeholder:text-gray-500 focus:border-[#ff6a00] ${
            isCompact ? "min-h-20" : "min-h-28"
          }`}
        />

        <div className="flex gap-2">
          <select
            value={community}
            onChange={(e) => setCommunity(e.target.value)}
            className="flex-1 rounded-xl border border-[#313131] bg-[#0f0f0f] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
          >
            <option value="general">General</option>
            <option value="study">Study</option>
            <option value="tech">Tech</option>
          </select>

          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-[#ff6a00] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ff8c42] disabled:opacity-60"
          >
            {loading ? "Posting..." : isCompact ? "Post" : "Create Post"}
          </button>
        </div>
      </form>
    </div>
  );
}
