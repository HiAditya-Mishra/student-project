import { doc, increment, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type LevelInfo = {
  level: number;
  title: string;
};

export const LEVELS: Array<{ level: number; title: string; minSapphires: number }> = [
  { level: 1, title: "Fresher", minSapphires: 0 },
  { level: 2, title: "Contributor", minSapphires: 200 },
  { level: 3, title: "Scholar", minSapphires: 800 },
  { level: 4, title: "Mentor", minSapphires: 2000 },
  { level: 5, title: "Luminary", minSapphires: 5000 },
  { level: 6, title: "Campus Legend", minSapphires: 15000 },
];

type UserRewardState = {
  sapphires?: number;
  level?: number;
  levelTitle?: string;
  postsCount?: number;
  commentsCount?: number;
  lastPostRewardDate?: string;
  postStreak?: number;
  upvoteRewardDate?: string;
  upvoteRewardToday?: number;
  updatedAt?: unknown;
};

function dateKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function yesterdayKey() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return dateKey(date);
}

export function getLevelFromSapphires(sapphires: number): LevelInfo {
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (sapphires >= level.minSapphires) current = level;
  }
  return { level: current.level, title: current.title };
}

async function applySapphireDelta(userId: string, delta: number, capByUpvote = false) {
  if (!delta) return 0;
  const userRef = doc(db, "users", userId);

  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(userRef);
    const current = (snapshot.exists() ? snapshot.data() : {}) as UserRewardState;
    const today = dateKey();
    let nextDelta = delta;

    if (capByUpvote) {
      const rewardDate = current.upvoteRewardDate || "";
      const todayReward = rewardDate === today ? current.upvoteRewardToday || 0 : 0;
      const remaining = Math.max(0, 100 - todayReward);
      nextDelta = Math.max(0, Math.min(nextDelta, remaining));
      tx.set(
        userRef,
        {
          upvoteRewardDate: today,
          upvoteRewardToday: todayReward + nextDelta,
        },
        { merge: true },
      );
    }

    if (!nextDelta) return 0;

    const nextSapphires = Math.max(0, (current.sapphires || 0) + nextDelta);
    const level = getLevelFromSapphires(nextSapphires);

    tx.set(
      userRef,
      {
        sapphires: nextSapphires,
        level: level.level,
        levelTitle: level.title,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return nextDelta;
  });
}

export async function ensureRewardDefaults(userId: string) {
  const info = getLevelFromSapphires(0);
  await setDoc(
    doc(db, "users", userId),
    {
      sapphires: 0,
      level: info.level,
      levelTitle: info.title,
      postsCount: 0,
      commentsCount: 0,
      postStreak: 0,
      upvoteRewardToday: 0,
      upvoteRewardDate: "",
      lastPostRewardDate: "",
    },
    { merge: true },
  );
}

export async function rewardPostCreate(userId: string) {
  const userRef = doc(db, "users", userId);
  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(userRef);
    const current = (snapshot.exists() ? snapshot.data() : {}) as UserRewardState;
    const today = dateKey();
    const yesterday = yesterdayKey();
    const previousPostDate = current.lastPostRewardDate || "";
    const previousStreak = current.postStreak || 0;
    const previousPostsCount = current.postsCount || 0;
    const nextPostsCount = previousPostsCount + 1;

    let sapphireDelta = 0;
    let nextStreak = previousStreak;

    // Daily streak reward: only once per day.
    if (previousPostDate !== today) {
      nextStreak = previousPostDate === yesterday ? previousStreak + 1 : 1;
      sapphireDelta += 5;
      if (nextStreak > 0 && nextStreak % 30 === 0) {
        sapphireDelta += 150;
      } else if (nextStreak > 0 && nextStreak % 7 === 0) {
        sapphireDelta += 25;
      }
    }

    // Community milestones for posting.
    if (nextPostsCount === 1) sapphireDelta += 10;
    if (nextPostsCount === 10) sapphireDelta += 50;

    const nextSapphires = Math.max(0, (current.sapphires || 0) + sapphireDelta);
    const level = getLevelFromSapphires(nextSapphires);

    tx.set(
      userRef,
      {
        postsCount: increment(1),
        lastPostRewardDate: previousPostDate === today ? previousPostDate : today,
        postStreak: previousPostDate === today ? previousStreak : nextStreak,
        sapphires: nextSapphires,
        level: level.level,
        levelTitle: level.title,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return { sapphireDelta, levelTitle: level.title, level: level.level, total: nextSapphires };
  });
}

export async function rewardCommentCreate(userId: string) {
  const userRef = doc(db, "users", userId);
  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(userRef);
    const current = (snapshot.exists() ? snapshot.data() : {}) as UserRewardState;
    const previousComments = current.commentsCount || 0;
    const nextComments = previousComments + 1;

    let sapphireDelta = 0;
    if (nextComments === 100) sapphireDelta += 100;

    const nextSapphires = Math.max(0, (current.sapphires || 0) + sapphireDelta);
    const level = getLevelFromSapphires(nextSapphires);

    tx.set(
      userRef,
      {
        commentsCount: increment(1),
        sapphires: nextSapphires,
        level: level.level,
        levelTitle: level.title,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return { sapphireDelta, levelTitle: level.title, level: level.level, total: nextSapphires };
  });
}

export async function rewardPostUpvote(authorId: string, options?: { crossed20?: boolean; trending?: boolean }) {
  let totalAwarded = 0;
  totalAwarded += await applySapphireDelta(authorId, 2, true);
  if (options?.crossed20) totalAwarded += await applySapphireDelta(authorId, 20, false);
  if (options?.trending) totalAwarded += await applySapphireDelta(authorId, 100, false);
  return totalAwarded;
}

export async function rewardCommentUpvote(authorId: string) {
  return applySapphireDelta(authorId, 3, true);
}

export async function rewardHelpfulComment(authorId: string) {
  return applySapphireDelta(authorId, 15, false);
}
