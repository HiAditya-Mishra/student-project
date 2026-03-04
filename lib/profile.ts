export type UserProfileDoc = {
  nickname?: string;
  handle?: string;
  bio?: string;
  hobbies?: string;
  interests?: string;
  skills?: string[];
  avatarSeed?: string;
  avatarUrl?: string;
  publicProfile?: boolean;
  linkedin?: string;
  github?: string;
  sapphires?: number;
  level?: number;
  levelTitle?: string;
  postsCount?: number;
  commentsCount?: number;
  postStreak?: number;
  lastPostRewardDate?: string;
  upvoteRewardDate?: string;
  upvoteRewardToday?: number;
  followingUsers?: string[];
  followingCommunities?: string[];
};

export function normalizeHandle(input: string) {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9._\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[@._-]+|[@._-]+$/g, "");

  return cleaned.slice(0, 30) || "campus_user";
}

export function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function avatarFromSeed(seed: string) {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed || "campus-user")}`;
}

export function resolveAvatar(profile?: Pick<UserProfileDoc, "avatarUrl" | "avatarSeed"> | null, fallbackSeed?: string) {
  if (profile?.avatarUrl?.trim()) {
    return profile.avatarUrl.trim();
  }
  return avatarFromSeed(profile?.avatarSeed?.trim() || fallbackSeed || "campus-user");
}
