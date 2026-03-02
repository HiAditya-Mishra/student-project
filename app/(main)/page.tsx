"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { db } from "@/app/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

type FeedPost = {
  id: string;
  title: string;
  content: string;
  authorName?: string | null;
  isAnonymous?: boolean;
  anonymous?: boolean;
  community?: string;
  likes?: number;
  commentsCount?: number;
  shares?: number;
  pinned?: boolean;
  upvotes?: number;
  downvotes?: number;
  createdAt?: Timestamp | null;
  currentFocus?: string;
  skillTags?: string[];
  bestAnswers?: number;
  verifiedInstitution?: boolean;
  liveRoomName?: string;
  liveNow?: boolean;
};

const communities = ["General", "Startups", "JEE", "Mental Health", "Coding"];
const skillOptions = ["UI/UX", "Python", "Calculus", "Entrepreneurship", "Rust", "Design"];
const POMODORO_SECONDS = 25 * 60;

function getAvatar(seed: string) {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed)}`;
}

function formatPostTime(createdAt?: Timestamp | null) {
  if (!createdAt) return "Just now";
  return formatDistanceToNow(createdAt.toDate(), { addSuffix: true });
}

function aliasFromId(id: string) {
  const number = Math.abs(
    id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % 900,
  ) + 100;
  return `Aspirant #${number}`;
}

function getHelpfulnessLevel(bestAnswers: number) {
  if (bestAnswers >= 25) return "Mentor";
  if (bestAnswers >= 10) return "Advanced";
  if (bestAnswers >= 3) return "Rising";
  return "Starter";
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const mins = String(Math.floor(safe / 60)).padStart(2, "0");
  const secs = String(safe % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function FeedPage() {
  const searchParams = useSearchParams();
  const selectedCommunity = searchParams.get("community") ?? "All";

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [newPostsCount, setNewPostsCount] = useState(0);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [draftCommunity, setDraftCommunity] = useState("General");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentFocus, setCurrentFocus] = useState("Prep for Mid-Terms");
  const [selectedSkills, setSelectedSkills] = useState<string[]>(["Python"]);
  const [verifiedInstitution, setVerifiedInstitution] = useState(false);
  const [ghostMode, setGhostMode] = useState(true);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(POMODORO_SECONDS);
  const [timerRunning, setTimerRunning] = useState(false);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    const baseQuery =
      selectedCommunity === "All"
        ? query(collection(db, "posts"), orderBy("createdAt", "desc"))
        : query(
            collection(db, "posts"),
            where("community", "==", selectedCommunity),
            orderBy("createdAt", "desc"),
          );

    const unsubscribe = onSnapshot(baseQuery, (snapshot) => {
      const nextPosts: FeedPost[] = snapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data() as Omit<FeedPost, "id">;
        return {
          id: docSnapshot.id,
          title: data.title ?? "Untitled Post",
          content: data.content ?? "",
          authorName: data.authorName ?? null,
          isAnonymous: data.isAnonymous ?? data.anonymous ?? false,
          anonymous: data.anonymous ?? false,
          community: data.community ?? "General",
          likes: data.likes ?? 0,
          commentsCount: data.commentsCount ?? 0,
          shares: data.shares ?? 0,
          pinned: data.pinned ?? false,
          upvotes: data.upvotes ?? 0,
          downvotes: data.downvotes ?? 0,
          createdAt: data.createdAt ?? null,
          currentFocus: data.currentFocus ?? "Learning",
          skillTags: data.skillTags ?? [],
          bestAnswers: data.bestAnswers ?? 0,
          verifiedInstitution: data.verifiedInstitution ?? false,
          liveRoomName: data.liveRoomName ?? `${data.community ?? "General"} Study Room`,
          liveNow: data.liveNow ?? false,
        };
      });

      nextPosts.sort((a, b) => {
        const pinSort = Number(b.pinned) - Number(a.pinned);
        if (pinSort !== 0) return pinSort;
        const aTime = a.createdAt?.toMillis() ?? 0;
        const bTime = b.createdAt?.toMillis() ?? 0;
        return bTime - aTime;
      });
      setPosts(nextPosts);

      if (isInitialLoad.current) {
        isInitialLoad.current = false;
      } else {
        const addedPosts = snapshot
          .docChanges()
          .filter((change) => change.type === "added").length;
        if (addedPosts > 0) {
          setNewPostsCount((prev) => prev + addedPosts);
        }
      }
    });

    return () => {
      unsubscribe();
      isInitialLoad.current = true;
    };
  }, [selectedCommunity]);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  const filteredPosts = useMemo(() => {
    if (!searchTerm.trim()) return posts;
    const term = searchTerm.toLowerCase();
    return posts.filter((post) => {
      return (
        post.title.toLowerCase().includes(term) ||
        post.content.toLowerCase().includes(term) ||
        (post.community ?? "").toLowerCase().includes(term) ||
        (post.skillTags ?? []).some((tag) => tag.toLowerCase().includes(term))
      );
    });
  }, [posts, searchTerm]);

  async function addReaction(
    postId: string,
    field: "likes" | "shares" | "upvotes" | "downvotes",
  ) {
    await updateDoc(doc(db, "posts", postId), { [field]: increment(1) });
  }

  function toggleSkill(skill: string) {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((item) => item !== skill) : [...prev, skill],
    );
  }

  async function submitPost() {
    if (!title.trim() || !content.trim() || isSubmitting) return;
    setIsSubmitting(true);

    try {
      await addDoc(collection(db, "posts"), {
        title: title.trim(),
        content: content.trim(),
        authorName: isAnonymous ? null : "Student",
        isAnonymous,
        anonymous: isAnonymous,
        community: draftCommunity,
        likes: 0,
        commentsCount: 0,
        shares: 0,
        pinned: false,
        upvotes: 0,
        downvotes: 0,
        createdAt: serverTimestamp(),
        currentFocus,
        skillTags: selectedSkills,
        bestAnswers: 0,
        verifiedInstitution,
        liveRoomName: `${draftCommunity} Study Room`,
        liveNow: false,
      });

      setTitle("");
      setContent("");
      setIsAnonymous(false);
      setDraftCommunity("General");
      setCurrentFocus("Prep for Mid-Terms");
      setSelectedSkills(["Python"]);
      setVerifiedInstitution(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  function joinStudyRoom(post: FeedPost) {
    setActiveRoom(post.liveRoomName ?? `${post.community ?? "General"} Study Room`);
    setTimerSeconds(POMODORO_SECONDS);
    setTimerRunning(true);
  }

  const todayChallenge = "Daily challenge: Share one thing you learned today.";

  return (
    <div className="p-6 space-y-6 bg-slate-50 dark:bg-zinc-950 min-h-screen transition-colors duration-300">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
        <p className="text-sm font-medium text-indigo-600 dark:text-violet-400">{todayChallenge}</p>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4 shadow-sm">
        <h2 className="text-lg font-semibold text-indigo-600 dark:text-violet-400">Create post</h2>

        <div className="rounded-xl p-1 bg-slate-100 dark:bg-zinc-800 inline-flex gap-1">
          <button
            onClick={() => setIsAnonymous(false)}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              !isAnonymous
                ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-violet-400"
                : "text-zinc-500 dark:text-zinc-300"
            }`}
          >
            Public Profile
          </button>
          <button
            onClick={() => setIsAnonymous(true)}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              isAnonymous
                ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-violet-400"
                : "text-zinc-500 dark:text-zinc-300"
            }`}
          >
            Incognito Mode
          </button>
        </div>

        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Post title"
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent p-2"
        />
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write your post..."
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent p-2 min-h-24"
        />

        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={currentFocus}
            onChange={(event) => setCurrentFocus(event.target.value)}
            placeholder="Current Focus"
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent p-2"
          />
          <select
            value={draftCommunity}
            onChange={(event) => setDraftCommunity(event.target.value)}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2"
          >
            {communities.map((community) => (
              <option key={community} value={community} className="text-black">
                {community}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-sm mb-2 text-zinc-600 dark:text-zinc-300">Skill Tags</p>
          <div className="flex flex-wrap gap-2">
            {skillOptions.map((skill) => (
              <button
                key={skill}
                onClick={() => toggleSkill(skill)}
                className={`px-3 py-1 text-sm rounded-full border ${
                  selectedSkills.includes(skill)
                    ? "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {skill}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={verifiedInstitution}
            onChange={() => setVerifiedInstitution((prev) => !prev)}
          />
          Institution verified (.edu linked)
        </label>

        <button
          onClick={submitPost}
          disabled={isSubmitting}
          className="rounded-lg bg-indigo-600 dark:bg-violet-500 text-white px-4 py-2 disabled:opacity-60"
        >
          {isSubmitting ? "Posting..." : "Publish"}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center justify-between">
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search posts..."
          className="w-full sm:w-72 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2"
        />
        <div className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-300">
          <span>
            {selectedCommunity === "All"
              ? "All communities"
              : `Community: ${selectedCommunity}`}
            {newPostsCount > 0 ? ` | ${newPostsCount} new post(s)` : ""}
          </span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={ghostMode}
              onChange={() => setGhostMode((prev) => !prev)}
            />
            Ghost Mode (listen only)
          </label>
        </div>
      </div>

      {filteredPosts.map((post) => {
        const anonymous = post.isAnonymous ?? post.anonymous ?? false;
        const displayName = anonymous
          ? aliasFromId(post.id)
          : post.authorName || "Student";
        const helpfulness = getHelpfulnessLevel(post.bestAnswers ?? 0);
        return (
          <div
            key={post.id}
            className="group bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 transition-colors duration-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Image
                  src={getAvatar(anonymous ? post.id : displayName)}
                  alt="User avatar"
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full border border-zinc-300 dark:border-zinc-700"
                />
                <div>
                  <h3 className="text-lg font-semibold">
                    {post.pinned ? "[PINNED] " : ""}
                    {post.title}
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {displayName}
                    {post.verifiedInstitution ? " [VERIFIED]" : ""} | {post.community} |{" "}
                    {formatPostTime(post.createdAt)}
                  </p>
                  <p className="text-xs mt-1 text-indigo-600 dark:text-violet-400">
                    Focus: {post.currentFocus || "Learning"}
                  </p>
                </div>
              </div>
              <span className="text-xs rounded-full px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                Helpfulness: {helpfulness}
              </span>
            </div>

            <p className="mt-3 text-zinc-700 dark:text-zinc-300">{post.content}</p>

            <div className="mt-2 flex flex-wrap gap-2">
              {(post.skillTags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-1 rounded-full border border-zinc-300 dark:border-zinc-700"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-3 flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                onClick={() => addReaction(post.id, "likes")}
                className="text-sm px-3 py-1 rounded-lg bg-indigo-100 dark:bg-violet-900/30"
              >
                Like {post.likes}
              </button>
              <button className="text-sm px-3 py-1 rounded-lg bg-slate-200 dark:bg-zinc-700">
                Comment {post.commentsCount}
              </button>
              <button
                onClick={() => addReaction(post.id, "shares")}
                className="text-sm px-3 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30"
              >
                Share {post.shares}
              </button>
              <button
                onClick={() => joinStudyRoom(post)}
                className="text-sm px-3 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-700"
              >
                Join live room {ghostMode ? "(listen only)" : "(mic on)"}
              </button>
            </div>
          </div>
        );
      })}

      {activeRoom ? (
        <div className="fixed bottom-4 right-4 w-72 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-4 z-50">
          <p className="text-sm font-semibold text-indigo-600 dark:text-violet-400">
            Pomodoro Dock
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Room: {activeRoom} | {ghostMode ? "Ghost Mode" : "Active Speaker"}
          </p>
          <p className="text-3xl font-bold mt-3">{formatClock(timerSeconds)}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setTimerRunning((prev) => !prev)}
              className="px-3 py-1 rounded-lg bg-indigo-600 dark:bg-violet-500 text-white text-sm"
            >
              {timerRunning ? "Pause" : "Resume"}
            </button>
            <button
              onClick={() => {
                setTimerSeconds(POMODORO_SECONDS);
                setTimerRunning(false);
              }}
              className="px-3 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-sm"
            >
              Reset
            </button>
            <button
              onClick={() => {
                setActiveRoom(null);
                setTimerRunning(false);
                setTimerSeconds(POMODORO_SECONDS);
              }}
              className="px-3 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-sm"
            >
              Leave
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
