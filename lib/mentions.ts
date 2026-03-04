export type MentionContext = {
  query: string;
  start: number;
  end: number;
};

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
