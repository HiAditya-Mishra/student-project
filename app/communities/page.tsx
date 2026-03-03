"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Community = {
  id: string;
  name: string;
  summary: string;
  rules: string[];
  tags: string[];
  activeNow: number;
  members: number;
};

type Post = {
  id: string;
  title: string;
  community: string;
  likes: number;
};

const communityCatalog: Community[] = [
  {
    id: "general",
    name: "r/general",
    summary: "Open forum for campus life, announcements, and questions.",
    rules: ["Be respectful", "No spam", "Use clear titles"],
    tags: ["Campus", "Announcements"],
    activeNow: 62,
    members: 1432,
  },
  {
    id: "coding",
    name: "r/coding",
    summary: "Debug help, hackathon prep, projects, and internship tips.",
    rules: ["Share context in questions", "No plagiarism", "Use code blocks"],
    tags: ["Programming", "Hackathons"],
    activeNow: 48,
    members: 1204,
  },
  {
    id: "study",
    name: "r/study",
    summary: "Daily accountability, exam prep, and study-room coordination.",
    rules: ["No cheating discussions", "Stay on-topic", "Encourage others"],
    tags: ["Productivity", "Exams"],
    activeNow: 57,
    members: 1108,
  },
  {
    id: "college-life",
    name: "r/college-life",
    summary: "Hostel, clubs, events, and day-to-day college experiences.",
    rules: ["No harassment", "No doxxing", "Keep it student-safe"],
    tags: ["Campus Life", "Events"],
    activeNow: 33,
    members: 978,
  },
  {
    id: "startups",
    name: "r/startups",
    summary: "Build-in-public, founder journeys, and startup resources.",
    rules: ["No fake promises", "Transparent promotion only", "Constructive feedback"],
    tags: ["Founders", "Career"],
    activeNow: 25,
    members: 654,
  },
  {
    id: "mental-health",
    name: "r/mental-health",
    summary: "Supportive peer space for stress, burnout, and wellbeing.",
    rules: ["No judgement", "No hate speech", "Emergency: contact local helpline"],
    tags: ["Wellbeing", "Peer Support"],
    activeNow: 21,
    members: 540,
  },
];

export default function CommunitiesPage() {
  const [joined, setJoined] = useState<Record<string, boolean>>({ general: true });
  const [posts, setPosts] = useState<Post[]>([]);
  const [selected, setSelected] = useState<string>("general");

  useEffect(() => {
    const postsQuery = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
      const nextPosts: Post[] = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Omit<Post, "id">),
      }));
      setPosts(nextPosts);
    });

    return () => unsubscribe();
  }, []);

  const selectedCommunity = useMemo(
    () => communityCatalog.find((community) => community.id === selected) ?? communityCatalog[0],
    [selected],
  );

  const trendingPosts = useMemo(() => {
    return posts
      .filter((post) => post.community === selectedCommunity.id)
      .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
      .slice(0, 5);
  }, [posts, selectedCommunity.id]);

  const statsByCommunity = useMemo(() => {
    const counts: Record<string, number> = {};
    posts.forEach((post) => {
      counts[post.community] = (counts[post.community] ?? 0) + 1;
    });
    return counts;
  }, [posts]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-3 rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
          <h2 className="text-lg font-bold text-[#ff8c42]">Discover Communities</h2>
          <p className="text-xs text-gray-400">Choose a community to view top posts, rules, and activity.</p>

          <div className="space-y-2">
            {communityCatalog.map((community) => (
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
                <p className="mt-1 text-xs text-gray-400">
                  {community.activeNow} active | {community.members.toLocaleString()} members
                </p>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-4">
          <div className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">{selectedCommunity.name}</h1>
                <p className="mt-1 text-sm text-gray-300">{selectedCommunity.summary}</p>
              </div>
              <button
                onClick={() =>
                  setJoined((prev) => ({ ...prev, [selectedCommunity.id]: !prev[selectedCommunity.id] }))
                }
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  joined[selectedCommunity.id]
                    ? "border border-[#ff6a00] text-[#ff8c42]"
                    : "bg-[#ff6a00] text-white"
                }`}
              >
                {joined[selectedCommunity.id] ? "Joined" : "Join"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {selectedCommunity.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-[#2a1b12] px-2 py-1 text-xs text-[#ff8c42]">
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[#2d2d2d] bg-[#101010] p-3">
                <p className="text-xs text-gray-400">Members</p>
                <p className="mt-1 text-xl font-bold">{selectedCommunity.members.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-[#2d2d2d] bg-[#101010] p-3">
                <p className="text-xs text-gray-400">Active Now</p>
                <p className="mt-1 text-xl font-bold">{selectedCommunity.activeNow}</p>
              </div>
              <div className="rounded-xl border border-[#2d2d2d] bg-[#101010] p-3">
                <p className="text-xs text-gray-400">Posts in Feed</p>
                <p className="mt-1 text-xl font-bold">{statsByCommunity[selectedCommunity.id] ?? 0}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
              <h3 className="text-lg font-semibold text-[#ff8c42]">Community Rules</h3>
              <ol className="mt-3 space-y-2 text-sm text-gray-300">
                {selectedCommunity.rules.map((rule, index) => (
                  <li key={rule} className="rounded-lg border border-[#2a2a2a] bg-[#101010] px-3 py-2">
                    {index + 1}. {rule}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
              <h3 className="text-lg font-semibold text-[#ff8c42]">Trending in {selectedCommunity.name}</h3>
              <div className="mt-3 space-y-2">
                {trendingPosts.length ? (
                  trendingPosts.map((post) => (
                    <div key={post.id} className="rounded-lg border border-[#2a2a2a] bg-[#101010] px-3 py-2">
                      <p className="text-sm font-semibold text-white">{post.title}</p>
                      <p className="mt-1 text-xs text-gray-400">{post.likes ?? 0} upvotes</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No posts yet for this community.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
