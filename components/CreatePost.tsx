"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, doc, getDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { normalizeHandle, resolveAvatar, UserProfileDoc } from "@/lib/profile";
import { getMentionContext, insertMention, MentionContext } from "@/lib/mentions";

type CreatePostProps = {
  mode?: "full" | "compact";
};

export default function CreatePost({ mode = "full" }: CreatePostProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [community, setCommunity] = useState("general");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Array<UserProfileDoc & { id: string }>>([]);
  const [mentionContext, setMentionContext] = useState<MentionContext | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  const isCompact = mode === "compact";

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const nextUsers = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as UserProfileDoc),
        }));
        setUsers(nextUsers);
      },
      (error) => {
        console.error(error);
        setUsers([]);
      },
    );

    return () => unsubscribe();
  }, []);

  const mentionOptions = useMemo(() => {
    if (!mentionContext) return [];
    const token = mentionContext.query.trim();

    return users
      .filter((user) => user.publicProfile !== false)
      .map((user) => ({
        id: user.id,
        nickname: user.nickname || "Campus User",
        handle: normalizeHandle(user.handle || user.nickname || ""),
        avatar: resolveAvatar(user, user.id),
      }))
      .filter((user) => {
        if (!token) return true;
        return user.handle.includes(token) || user.nickname.toLowerCase().includes(token);
      })
      .slice(0, 6);
  }, [mentionContext, users]);

  const syncMentionContext = (nextText: string, caret: number) => {
    const nextMentionContext = getMentionContext(nextText, caret);
    setMentionContext(nextMentionContext);
    setActiveMentionIndex(0);
  };

  const applyMention = (selectedHandle: string) => {
    if (!mentionContext) return;
    const { nextText, caretIndex } = insertMention(content, mentionContext, selectedHandle);
    setContent(nextText);
    setMentionContext(null);
    setActiveMentionIndex(0);

    requestAnimationFrame(() => {
      if (!contentRef.current) return;
      contentRef.current.focus();
      contentRef.current.setSelectionRange(caretIndex, caretIndex);
    });
  };

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
      const userRef = doc(db, "users", auth.currentUser.uid);
      const userSnapshot = await getDoc(userRef);
      const profile = userSnapshot.exists()
        ? userSnapshot.data() as {
            nickname?: string;
            handle?: string;
            avatarUrl?: string;
            avatarSeed?: string;
            publicProfile?: boolean;
          }
        : {};

      if (profile.publicProfile === false) {
        alert("Switch to Public Profile to create posts.");
        return;
      }

      const authorName = profile.nickname?.trim() || auth.currentUser?.displayName || "Aspirant";
      const authorHandle = normalizeHandle(profile.handle?.trim() || profile.nickname?.trim() || authorName);
      const authorAvatarUrl = resolveAvatar(profile, auth.currentUser.uid);
      const mentions = Array.from(
        new Set(
          `${title} ${content}`
            .match(/@([a-zA-Z0-9._-]+)/g)?.map((mention) => normalizeHandle(mention.slice(1))) ?? [],
        ),
      ).slice(0, 20);

      await addDoc(collection(db, "posts"), {
        title: title.trim(),
        content: content.trim(),
        community,
        imageUrl: imageDataUrl.trim(),
        author: authorName,
        authorId: auth.currentUser.uid,
        authorHandle,
        authorAvatarUrl,
        mentions,
        createdAt: serverTimestamp(),
        likes: 0,
        likedBy: [],
      });

      setTitle("");
      setContent("");
      setCommunity("general");
      setImageDataUrl("");
      setImageUploadError(null);
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

  const onPostImageChange = (file: File | null) => {
    if (!file) {
      setImageDataUrl("");
      setImageUploadError(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setImageUploadError("Please upload an image file.");
      return;
    }

    if (file.size > 350 * 1024) {
      setImageUploadError("Image must be under 350KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setImageDataUrl(reader.result);
      setImageUploadError(null);
    };
    reader.readAsDataURL(file);
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
          ref={contentRef}
          placeholder={isCompact ? "Add a post..." : "Write something..."}
          value={content}
          onChange={(e) => {
            const nextText = e.target.value;
            setContent(nextText);
            syncMentionContext(nextText, e.target.selectionStart ?? nextText.length);
          }}
          onKeyDown={(e) => {
            if (!mentionContext || !mentionOptions.length) return;

            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveMentionIndex((prev) => (prev + 1) % mentionOptions.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveMentionIndex((prev) => (prev - 1 + mentionOptions.length) % mentionOptions.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              const selected = mentionOptions[activeMentionIndex];
              if (selected) applyMention(selected.handle);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setMentionContext(null);
            }
          }}
          className={`rounded-xl border border-[#313131] bg-[#0f0f0f] px-3 py-2 text-sm outline-none placeholder:text-gray-500 focus:border-[#ff6a00] ${
            isCompact ? "min-h-20" : "min-h-28"
          }`}
        />
        {mentionContext && mentionOptions.length ? (
          <div className="rounded-xl border border-[#2f2f2f] bg-[#121212] p-1">
            {mentionOptions.map((user, index) => (
              <button
                key={user.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyMention(user.handle);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                  index === activeMentionIndex ? "bg-[#25160d]" : "hover:bg-[#1c1c1c]"
                }`}
              >
                <img src={user.avatar} alt={user.nickname} className="h-7 w-7 rounded-full border border-[#ff8c42]" />
                <span className="text-sm text-white">{user.nickname}</span>
                <span className="text-xs text-gray-400">@{user.handle}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="block text-xs text-gray-400">Post image (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onPostImageChange(e.target.files?.[0] ?? null)}
            className="w-full rounded-xl border border-[#313131] bg-[#0f0f0f] px-3 py-2 text-xs outline-none file:mr-2 file:rounded file:border-0 file:bg-[#ff6a00] file:px-2 file:py-1 file:text-white"
          />
          {imageUploadError ? <p className="text-xs text-red-300">{imageUploadError}</p> : null}
          {imageDataUrl ? (
            <img src={imageDataUrl} alt="Post preview" className="max-h-56 w-full rounded-xl border border-[#2f2f2f] object-cover" />
          ) : null}
        </div>

        <div className="flex gap-2">
          <select
            value={community}
            onChange={(e) => setCommunity(e.target.value)}
            className="flex-1 rounded-xl border border-[#313131] bg-[#0f0f0f] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
          >
            <option value="general">General</option>
            <option value="coding">Coding & Tech</option>
            <option value="study">Study Rooms</option>
            <option value="college-life">College Life</option>
            <option value="startups">Startups</option>
            <option value="mental-health">Mental Health</option>
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
