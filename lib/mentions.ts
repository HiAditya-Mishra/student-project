export type MentionContext = {
  query: string;
  start: number;
  end: number;
};

export type MentionCandidate = {
  id: string;
  nickname: string;
  handle: string;
  avatar: string;
  skills?: string[];
  interests?: string;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with",
  "you",
]);

export function getMentionContext(text: string, caretIndex: number): MentionContext | null {
  const safeCaret = Math.max(0, Math.min(caretIndex, text.length));
  const uptoCaret = text.slice(0, safeCaret);
  const match = uptoCaret.match(/(?:^|\s)@([a-zA-Z0-9._-]{0,30})$/);
  if (!match) return null;

  const atIndex = uptoCaret.lastIndexOf("@");
  if (atIndex < 0) return null;

  return {
    query: (match[1] || "").toLowerCase(),
    start: atIndex,
    end: safeCaret,
  };
}

export function insertMention(text: string, context: MentionContext, handle: string) {
  const nextHandle = handle.replace(/^@+/, "");
  const nextText = `${text.slice(0, context.start + 1)}${nextHandle} ${text.slice(context.end)}`;
  const caretIndex = context.start + 1 + nextHandle.length + 1;
  return { nextText, caretIndex };
}

export function extractTopicTokens(text: string) {
  const normalized = text.toLowerCase();
  const tokens = normalized
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  return Array.from(new Set(tokens)).slice(0, 40);
}

type MentionRankingInput = {
  candidate: MentionCandidate;
  query: string;
  topicTokens: string[];
  selectedCommunity?: string;
  candidateCommunities?: string[];
  sharedCommunities?: string[];
  interactionScore?: number;
};

export function rankMentionCandidate(input: MentionRankingInput) {
  const token = input.query.trim().toLowerCase();
  const handle = input.candidate.handle.toLowerCase();
  const name = input.candidate.nickname.toLowerCase();
  let score = 0;

  if (!token) score += 5;
  if (token && handle.startsWith(token)) score += 70;
  else if (token && handle.includes(token)) score += 45;
  if (token && name.startsWith(token)) score += 30;
  else if (token && name.includes(token)) score += 20;

  const candidateTopics = extractTopicTokens(
    `${(input.candidate.skills ?? []).join(" ")} ${input.candidate.interests ?? ""}`,
  );
  const topicMatches = input.topicTokens.filter((topic) => candidateTopics.includes(topic)).length;
  score += Math.min(20, topicMatches * 4);

  if (input.selectedCommunity && (input.candidateCommunities ?? []).includes(input.selectedCommunity)) {
    score += 28;
  }

  score += Math.min(18, (input.sharedCommunities ?? []).length * 6);
  score += Math.min(35, input.interactionScore ?? 0);
  return score;
}
