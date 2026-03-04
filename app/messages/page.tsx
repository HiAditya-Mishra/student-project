"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

type Message = {
  id: string;
  roomId?: string;
  text?: string;
  senderId?: string;
  senderName?: string;
  createdAt?: { seconds?: number };
};

type Author = {
  id: string;
  name: string;
};

function roomIdForPair(a: string, b: string) {
  return [a, b].sort().join("__");
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>("group:general");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "messages"), orderBy("createdAt", "asc")),
      (snapshot) => {
        setError(null);
        setMessages(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...(docSnapshot.data() as Omit<Message, "id">),
          })),
        );
      },
      (snapshotError) => {
        console.error(snapshotError);
        setError("Messages are blocked by Firestore rules.");
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "posts"), (snapshot) => {
      const seen = new Set<string>();
      const nextAuthors: Author[] = [];
      snapshot.docs.forEach((docSnapshot) => {
        const data = docSnapshot.data() as { authorId?: string; author?: string };
        if (!data.authorId || seen.has(data.authorId)) return;
        seen.add(data.authorId);
        nextAuthors.push({ id: data.authorId, name: data.author || "Aspirant" });
      });
      setAuthors(nextAuthors);
    });
    return () => unsubscribe();
  }, []);

  const visibleMessages = useMemo(
    () => messages.filter((message) => message.roomId === selectedRoom),
    [messages, selectedRoom],
  );

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first.");
      return;
    }
    if (!draft.trim()) return;

    try {
      await addDoc(collection(db, "messages"), {
        roomId: selectedRoom,
        text: draft.trim(),
        senderId: user.uid,
        senderName: user.displayName || "Campus User",
        createdAt: serverTimestamp(),
      });
      setDraft("");
    } catch (sendError) {
      console.error(sendError);
      alert("Could not send message.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3 rounded-2xl border border-[#2d2d2d] bg-[#141414] p-4">
          <h2 className="text-lg font-semibold text-[#ff8c42]">Chats</h2>
          <button
            onClick={() => setSelectedRoom("group:general")}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
              selectedRoom === "group:general" ? "bg-[#ff6a00]" : "border border-[#2f2f2f]"
            }`}
          >
            Group: General
          </button>
          <button
            onClick={() => setSelectedRoom("group:projects")}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
              selectedRoom === "group:projects" ? "bg-[#ff6a00]" : "border border-[#2f2f2f]"
            }`}
          >
            Group: Projects
          </button>
          <p className="pt-2 text-xs text-gray-500">Direct Messages</p>
          {authors.map((author) => {
            const self = auth.currentUser?.uid || "";
            if (!self || self === author.id) return null;
            const roomId = `dm:${roomIdForPair(self, author.id)}`;
            return (
              <button
                key={author.id}
                onClick={() => setSelectedRoom(roomId)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  selectedRoom === roomId ? "bg-[#ff6a00]" : "border border-[#2f2f2f]"
                }`}
              >
                {author.name}
              </button>
            );
          })}
        </aside>

        <section className="rounded-2xl border border-[#2d2d2d] bg-[#141414] p-4">
          <h1 className="text-lg font-semibold text-[#ff8c42]">Room: {selectedRoom}</h1>
          {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}

          <div className="mt-3 h-[58vh] space-y-2 overflow-y-auto rounded-xl border border-[#2d2d2d] bg-[#101010] p-3">
            {visibleMessages.length ? (
              visibleMessages.map((message) => (
                <div key={message.id} className="rounded-lg border border-[#252525] bg-[#141414] p-2">
                  <p className="text-xs text-[#ff8c42]">{message.senderName || "Campus User"}</p>
                  <p className="text-sm text-gray-200">{message.text}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No messages yet.</p>
            )}
          </div>

          <form onSubmit={send} className="mt-3 flex gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type message..."
              className="flex-1 rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
            />
            <button type="submit" className="rounded-lg bg-[#ff6a00] px-4 py-2 text-sm font-semibold">
              Send
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
