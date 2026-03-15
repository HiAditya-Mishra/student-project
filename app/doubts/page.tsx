"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { rewardDoubtAnswer } from "@/lib/rewards";

type PrivacyType = "public" | "private" | "invite";

type Community = {
  id: string;
  name: string;
  privacy?: PrivacyType;
};

type Doubt = {
  id: string;
  title?: string;
  question?: string;
  subject?: string;
  tags?: string[];
  authorId?: string;
  authorName?: string;
  answersCount?: number;
  acceptedAnswerId?: string;
  solvedAt?: { seconds?: number };
  solvedBy?: string;
  createdAt?: { seconds?: number };
  lastAnsweredAt?: { seconds?: number };
  communityId?: string;
};

type DoubtAnswer = {
  id: string;
  text?: string;
  authorId?: string;
  authorName?: string;
  createdAt?: { seconds?: number };
};

type UserDocLite = {
  followingCommunities?: string[];
};

export default function DoubtsPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [postCommunityId, setPostCommunityId] = useState<string>("all");
  const [filterCommunityId, setFilterCommunityId] = useState<string>("all");
  const [doubts, setDoubts] = useState<Doubt[]>([]);
  const [doubtsError, setDoubtsError] = useState<string | null>(null);
  const [selectedDoubtId, setSelectedDoubtId] = useState<string>("");
  const [selectedDoubtCommunityId, setSelectedDoubtCommunityId] = useState<string>("");
  const [doubtAnswers, setDoubtAnswers] = useState<DoubtAnswer[]>([]);
  const [doubtAnswerDraft, setDoubtAnswerDraft] = useState("");
  const [doubtAnswerBusy, setDoubtAnswerBusy] = useState(false);
  const [doubtTitle, setDoubtTitle] = useState("");
  const [doubtQuestion, setDoubtQuestion] = useState("");
  const [doubtSubject, setDoubtSubject] = useState("");
  const [doubtTags, setDoubtTags] = useState("");
  const [doubtPosting, setDoubtPosting] = useState(false);
  const [doubtSubjectFilter, setDoubtSubjectFilter] = useState("");
  const [doubtTagFilter, setDoubtTagFilter] = useState("");

  useEffect(() => {
    const authUnsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setCurrentUserId("");
        setJoined({});
        return;
      }
      setCurrentUserId(user.uid);
      const loadProfile = async () => {
        const snapshot = await getDoc(doc(db, "users", user.uid));
        const data = (snapshot.exists() ? snapshot.data() : {}) as UserDocLite;
        const following = data.followingCommunities ?? [];
        const next: Record<string, boolean> = {};
        following.forEach((communityId) => {
          next[communityId] = true;
        });
        setJoined(next);
      };
      void loadProfile();
    });

    return () => {
      authUnsub();
    };
  }, []);

  useEffect(() => {
    const loadCommunities = async () => {
      try {
        const snapshot = await getDocs(collection(db, "communities"));
        const next = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Omit<Community, "id">),
        }));
        setCommunities(next);
      } catch (error) {
        console.error(error);
        setCommunities([]);
      }
    };
    void loadCommunities();
  }, []);

  useEffect(() => {
    const loadDoubts = async () => {
      try {
        const snapshot = await getDocs(query(collectionGroup(db, "doubts")));
        setDoubtsError(null);
        const next = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data() as Omit<Doubt, "id">;
          const communityId = docSnapshot.ref.parent.parent?.id ?? "";
          return {
            id: docSnapshot.id,
            ...data,
            communityId,
          };
        });
        setDoubts(next);
      } catch (error) {
        console.error(error);
        setDoubtsError(
          typeof error === "object" && error && "code" in error && error.code === "permission-denied"
            ? "Doubts are blocked by Firestore rules."
            : "Failed to load doubts.",
        );
        setDoubts([]);
      }
    };

    void loadDoubts();
  }, []);

  useEffect(() => {
    if (!selectedDoubtId || !selectedDoubtCommunityId) {
      setDoubtAnswers([]);
      return;
    }

    const loadAnswers = async () => {
      try {
        const answersRef = query(
          collection(db, "communities", selectedDoubtCommunityId, "doubts", selectedDoubtId, "answers"),
          orderBy("createdAt", "asc"),
        );
        const snapshot = await getDocs(answersRef);
        setDoubtAnswers(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...(docSnapshot.data() as Omit<DoubtAnswer, "id">),
          })),
        );
      } catch (error) {
        console.error(error);
        setDoubtAnswers([]);
      }
    };

    void loadAnswers();
  }, [selectedDoubtCommunityId, selectedDoubtId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const community = params.get("community");
    const doubt = params.get("doubt");
    if (community) {
      setFilterCommunityId(community);
      setPostCommunityId(community);
    }
    if (doubt && community) {
      setSelectedDoubtId(doubt);
      setSelectedDoubtCommunityId(community);
    }
  }, []);

  const communityById = useMemo(() => {
    const map = new Map<string, Community>();
    communities.forEach((community) => map.set(community.id, community));
    return map;
  }, [communities]);

  const sortedDoubts = useMemo(() => {
    const subjectToken = doubtSubjectFilter.trim().toLowerCase();
    const tagToken = doubtTagFilter.trim().toLowerCase();

    return [...doubts]
      .filter((doubt) => {
        if (!doubt.communityId) return false;
        if (filterCommunityId !== "all" && doubt.communityId !== filterCommunityId) return false;
        if (subjectToken && !(doubt.subject || "").toLowerCase().includes(subjectToken)) return false;
        if (!tagToken) return true;
        return (doubt.tags ?? []).some((tag) => tag.toLowerCase().includes(tagToken));
      })
      .sort((a, b) => {
        const aCount = a.answersCount ?? 0;
        const bCount = b.answersCount ?? 0;
        if (aCount !== bCount) return aCount - bCount;
        return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);
      });
  }, [doubts, doubtSubjectFilter, doubtTagFilter, filterCommunityId]);

  const handleSelectDoubt = (doubt: Doubt) => {
    if (!doubt.communityId) return;
    const nextId = doubt.id;
    if (selectedDoubtId === nextId) {
      setSelectedDoubtId("");
      setSelectedDoubtCommunityId("");
      return;
    }
    setSelectedDoubtId(nextId);
    setSelectedDoubtCommunityId(doubt.communityId);
  };

  const submitDoubt = async (event: FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first.");
      return;
    }
    if (postCommunityId === "all") {
      alert("Choose a community for your doubt.");
      return;
    }
    if (!doubtTitle.trim() || !doubtQuestion.trim()) {
      alert("Doubt title and question are required.");
      return;
    }

    try {
      setDoubtPosting(true);
      await addDoc(collection(db, "communities", postCommunityId, "doubts"), {
        title: doubtTitle.trim(),
        question: doubtQuestion.trim(),
        subject: doubtSubject.trim(),
        tags: doubtTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 10),
        authorId: user.uid,
        authorName: user.displayName || "Spheera User",
        answersCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setDoubtTitle("");
      setDoubtQuestion("");
      setDoubtSubject("");
      setDoubtTags("");
    } catch (error) {
      console.error(error);
      alert("Could not post doubt.");
    } finally {
      setDoubtPosting(false);
    }
  };

  const submitDoubtAnswer = async () => {
    const user = auth.currentUser;
    if (!user || !selectedDoubtId || !selectedDoubtCommunityId) {
      alert("Please login first.");
      return;
    }
    const content = doubtAnswerDraft.trim();
    if (!content) {
      alert("Write an answer first.");
      return;
    }

    try {
      setDoubtAnswerBusy(true);
      const doubtRef = doc(db, "communities", selectedDoubtCommunityId, "doubts", selectedDoubtId);
      const answerRef = doc(
        collection(db, "communities", selectedDoubtCommunityId, "doubts", selectedDoubtId, "answers"),
      );
      const targetDoubt = sortedDoubts.find((doubt) => doubt.id === selectedDoubtId);
      await runTransaction(db, async (tx) => {
        tx.set(answerRef, {
          text: content,
          authorId: user.uid,
          authorName: user.displayName || "Spheera User",
          createdAt: serverTimestamp(),
        });
        tx.update(doubtRef, {
          answersCount: increment(1),
          lastAnsweredAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await rewardDoubtAnswer(user.uid);
      const notify = async (targetUid: string, payload: { title: string; body?: string; kind?: string; link?: string }) => {
        await addDoc(collection(db, "users", targetUid, "notifications"), {
          ...payload,
          read: false,
          createdAt: serverTimestamp(),
        });
      };

      if (targetDoubt?.authorId && targetDoubt.authorId !== user.uid) {
        await notify(targetDoubt.authorId, {
          title: "New answer to your doubt",
          body: targetDoubt.title || "Someone replied to your doubt.",
          kind: "Doubts",
          link: `/doubts?community=${selectedDoubtCommunityId}&doubt=${selectedDoubtId}`,
        });
      }

      await notify(user.uid, {
        title: "Sapphires earned",
        body: "You earned sapphires for answering a doubt.",
        kind: "Sapphires",
        link: `/doubts?community=${selectedDoubtCommunityId}&doubt=${selectedDoubtId}`,
      });
      setDoubtAnswerDraft("");
    } catch (error) {
      console.error(error);
      alert("Could not submit answer.");
    } finally {
      setDoubtAnswerBusy(false);
    }
  };

  const markDoubtSolved = async (doubtId: string, answerId: string) => {
    const user = auth.currentUser;
    if (!user || !selectedDoubtCommunityId) return;
    try {
      await updateDoc(doc(db, "communities", selectedDoubtCommunityId, "doubts", doubtId), {
        acceptedAnswerId: answerId,
        solvedAt: serverTimestamp(),
        solvedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error(error);
      alert("Could not mark as solved.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl px-4 py-6 space-y-4">
        <div className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-[#ff8c42]">Doubts</h1>
              <p className="text-xs text-gray-400">Ask questions across communities and help others unlock answers.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-gray-400">
              <span className="rounded-full border border-[#2f2f2f] px-3 py-1">
                Joined: {Object.keys(joined).length}
              </span>
              <span className="rounded-full border border-[#2f2f2f] px-3 py-1">
                Total Doubts: {sortedDoubts.length}
              </span>
            </div>
          </div>
        </div>

        {doubtsError ? (
          <div className="rounded-xl border border-red-600/40 bg-red-950/30 p-3 text-sm text-red-200">
            {doubtsError}
          </div>
        ) : null}

        <form onSubmit={submitDoubt} className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-[#ff8c42]">Post a Doubt</p>
            <p className="text-xs text-gray-500">Choose the community before sharing your question.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={postCommunityId}
              onChange={(event) => setPostCommunityId(event.target.value)}
              className="w-full rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
            >
              <option value="all">Select a community</option>
              {communities.map((community) => (
                <option key={community.id} value={community.id}>
                  {community.name}
                </option>
              ))}
            </select>
            <input
              value={doubtSubject}
              onChange={(event) => setDoubtSubject(event.target.value)}
              placeholder="Subject (e.g. DSA, Physics)"
              className="w-full rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
            />
          </div>
          <input
            value={doubtTitle}
            onChange={(event) => setDoubtTitle(event.target.value)}
            placeholder="Doubt title"
            className="w-full rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
          />
          <textarea
            value={doubtQuestion}
            onChange={(event) => setDoubtQuestion(event.target.value)}
            placeholder="Explain the doubt with details or steps tried."
            className="min-h-24 w-full rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
          />
          <input
            value={doubtTags}
            onChange={(event) => setDoubtTags(event.target.value)}
            placeholder="Tags (comma separated)"
            className="w-full rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
          />
          <button
            type="submit"
            disabled={doubtPosting}
            className="rounded-lg bg-[#ff6a00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {doubtPosting ? "Posting..." : "Post Doubt"}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#2f2f2f] bg-[#141414] p-3">
          <select
            value={filterCommunityId}
            onChange={(event) => setFilterCommunityId(event.target.value)}
            className="min-w-[200px] flex-1 rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
          >
            <option value="all">All communities</option>
            {communities.map((community) => (
              <option key={`filter-${community.id}`} value={community.id}>
                {community.name}
              </option>
            ))}
          </select>
          <input
            value={doubtSubjectFilter}
            onChange={(event) => setDoubtSubjectFilter(event.target.value)}
            placeholder="Filter by subject"
            className="min-w-[200px] flex-1 rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
          />
          <input
            value={doubtTagFilter}
            onChange={(event) => setDoubtTagFilter(event.target.value)}
            placeholder="Filter by tag"
            className="min-w-[160px] flex-1 rounded-lg border border-[#303030] bg-[#101010] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
          />
        </div>

        <div className="space-y-3">
          {sortedDoubts.length ? (
            sortedDoubts.map((doubt) => {
              const isSelected = selectedDoubtId === doubt.id;
              const answerCount = doubt.answersCount ?? 0;
              const isSolved = Boolean(doubt.acceptedAnswerId);
              const isOwner = currentUserId && doubt.authorId === currentUserId;
              const communityName = doubt.communityId ? communityById.get(doubt.communityId)?.name : "Unknown community";
              return (
                <div key={`${doubt.communityId}-${doubt.id}`} className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-gray-400">{communityName}</p>
                      <p className="text-lg font-semibold text-white">{doubt.title || "Untitled doubt"}</p>
                      <p className="text-xs text-gray-500">
                        {doubt.subject ? `${doubt.subject} · ` : ""}{answerCount === 0 ? "Unanswered" : `${answerCount} answers`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isSolved ? (
                        <span className="rounded-full border border-green-700/60 bg-green-950/40 px-3 py-1 text-[11px] text-green-300">
                          Solved
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleSelectDoubt(doubt)}
                        className="rounded-lg border border-[#2f2f2f] px-3 py-1 text-xs text-gray-300 hover:border-[#ff6a00]"
                      >
                        {isSelected ? "Hide" : "Open"}
                      </button>
                    </div>
                  </div>

                  {doubt.tags?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {doubt.tags.map((tag) => (
                        <span key={tag} className="rounded-md bg-[#2a1b12] px-2 py-1 text-xs text-[#ff8c42]">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {doubt.question ? (
                    <p className="mt-3 text-sm text-gray-300 whitespace-pre-wrap">{doubt.question}</p>
                  ) : null}

                  <p className="mt-3 text-xs text-gray-500">Posted by {doubt.authorName || "Spheera User"}</p>

                  {isSelected ? (
                    <div className="mt-4 space-y-3 rounded-xl border border-[#262626] bg-[#101010] p-3">
                      <div className="space-y-2">
                        {doubtAnswers.length ? (
                          doubtAnswers.map((answer) => (
                            <div
                              key={answer.id}
                              className={`rounded-lg border p-3 ${
                                doubt.acceptedAnswerId === answer.id
                                  ? "border-green-600/60 bg-green-950/20"
                                  : "border-[#262626] bg-[#141414]"
                              }`}
                            >
                              <p className="text-xs text-[#ff8c42]">{answer.authorName || "Spheera User"}</p>
                              <p className="mt-1 text-sm text-gray-200 whitespace-pre-wrap">{answer.text || ""}</p>
                              <div className="mt-2 flex items-center gap-2">
                                {doubt.acceptedAnswerId === answer.id ? (
                                  <span className="rounded-full border border-green-700/60 bg-green-950/40 px-2 py-0.5 text-[10px] text-green-300">
                                    Accepted Answer
                                  </span>
                                ) : null}
                                {isOwner && !isSolved ? (
                                  <button
                                    type="button"
                                    onClick={() => void markDoubtSolved(doubt.id, answer.id)}
                                    className="rounded border border-[#2f2f2f] px-2 py-0.5 text-[10px] text-gray-300 hover:border-[#ff6a00]"
                                  >
                                    Mark as solved
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500">No answers yet. Be the first to help.</p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <textarea
                          value={doubtAnswerDraft}
                          onChange={(event) => setDoubtAnswerDraft(event.target.value)}
                          placeholder="Share your answer..."
                          className="min-h-20 w-full rounded-lg border border-[#2f2f2f] bg-[#141414] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
                        />
                        <button
                          type="button"
                          onClick={() => void submitDoubtAnswer()}
                          disabled={doubtAnswerBusy}
                          className="self-start rounded-lg bg-[#ff6a00] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {doubtAnswerBusy ? "Answering..." : "Post Answer (+Sapphires)"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="rounded-xl border border-[#2f2f2f] bg-[#141414] p-4 text-sm text-gray-500">
              No doubts yet. Ask the first one.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
