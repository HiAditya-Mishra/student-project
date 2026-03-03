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
};

type Post = {
  id: string;
  title: string;
  community: string;
  likes: number;
  authorId?: string;
};

const communityCatalog: Community[] = [
  {
    id: "general",
    name: "General",
    summary: "Open forum for campus life, announcements, and questions.",
    rules: ["Be respectful", "No spam", "Use clear titles"],
    tags: ["Campus", "Announcements"],
  },
  {
    id: "coding",
    name: "Coding",
    summary: "Debug help, hackathon prep, projects, and internship tips.",
    rules: ["Share context in questions", "No plagiarism", "Use code blocks"],
    tags: ["Programming", "Hackathons"],
  },
  {
    id: "study",
    name: "Study",
    summary: "Daily accountability, exam prep, and study-room coordination.",
    rules: ["No cheating discussions", "Stay on-topic", "Encourage others"],
    tags: ["Productivity", "Exams"],
  },
  {
    id: "college-life",
    name: "College Life",
    summary: "Hostel, clubs, events, and day-to-day college experiences.",
    rules: ["No harassment", "No doxxing", "Keep it student-safe"],
    tags: ["Campus Life", "Events"],
  },
  {
    id: "startups",
    name: "Startups",
    summary: "Build-in-public, founder journeys, and startup resources.",
    rules: ["No fake promises", "Transparent promotion only", "Constructive feedback"],
    tags: ["Founders", "Career"],
  },
  {
    id: "mental-health",
    name: "Mental Health",
    summary: "Supportive peer space for stress, burnout, and wellbeing.",
    rules: ["No judgement", "No hate speech", "Emergency: contact local helpline"],
    tags: ["Wellbeing", "Peer Support"],
  },
];

export default function CommunitiesPage() {
  const [joined, setJoined] = useState<Record<string, boolean>>({ general: true });
  const [posts, setPosts] = useState<Post[]>([]);
  const [selected, setSelected] = useState<string>("general");
  const [communityError, setCommunityError] = useState<string | null>(null);

  useEffect(() => {
    const postsQuery = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
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
    const stats: Record<string, { posts: number; likes: number; creators: Set<string> }> = {};
    posts.forEach((post) => {
      if (!stats[post.community]) {
        stats[post.community] = { posts: 0, likes: 0, creators: new Set<string>() };
      }
      stats[post.community].posts += 1;
      stats[post.community].likes += post.likes ?? 0;
      if (post.authorId) stats[post.community].creators.add(post.authorId);
    });
    return stats;
  }, [posts]);

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
                  {statsByCommunity[community.id]?.posts ?? 0} posts | {statsByCommunity[community.id]?.likes ?? 0} likes
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
                <p className="text-xs text-gray-400">Post Creators</p>
                <p className="mt-1 text-xl font-bold">{statsByCommunity[selectedCommunity.id]?.creators.size ?? 0}</p>
              </div>
              <div className="rounded-xl border border-[#2d2d2d] bg-[#101010] p-3">
                <p className="text-xs text-gray-400">Total Likes</p>
                <p className="mt-1 text-xl font-bold">{statsByCommunity[selectedCommunity.id]?.likes ?? 0}</p>
              </div>
              <div className="rounded-xl border border-[#2d2d2d] bg-[#101010] p-3">
                <p className="text-xs text-gray-400">Posts in Feed</p>
                <p className="mt-1 text-xl font-bold">{statsByCommunity[selectedCommunity.id]?.posts ?? 0}</p>
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
