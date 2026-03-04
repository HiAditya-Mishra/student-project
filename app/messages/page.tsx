"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import { normalizeHandle } from "@/lib/profile";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";

type Message = {
  id: string;
  roomId?: string;
  text?: string;
  senderId?: string;
  senderName?: string;
  createdAt?: { seconds?: number };
};

type UserItem = {
  id: string;
  name: string;
  handle: string;
};

type RoomItem = {
  id: string;
  name: string;
  handle: string;
  kind: "dm";
  peerId?: string;
};

function roomIdForPair(a: string, b: string) {
  return [a, b].sort().join("__");
}

function formatMessageTime(seconds?: number) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUserId(user?.uid || "");
    });
    return () => unsubscribe();
  }, []);

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
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const nextUsers: UserItem[] = snapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data() as { nickname?: string; handle?: string };
        return {
          id: docSnapshot.id,
          name: (data.nickname || "Campus User").trim(),
          handle: normalizeHandle(data.handle || data.nickname || "campus_user"),
        };
      });
      setUsers(nextUsers);
    });
    return () => unsubscribe();
  }, []);

  const roomItems = useMemo(() => {
    if (!currentUserId) return [];
    return users
      .filter((user) => user.id !== currentUserId)
      .map((user) => ({
        id: `dm:${roomIdForPair(currentUserId, user.id)}`,
        name: user.name,
        handle: user.handle,
        kind: "dm" as const,
        peerId: user.id,
      }));
  }, [users, currentUserId]);

  useEffect(() => {
    if (selectedRoom && roomItems.some((room) => room.id === selectedRoom)) return;
    setSelectedRoom(roomItems[0]?.id || "");
  }, [roomItems, selectedRoom]);

  const messagesByRoom = useMemo(() => {
    const map: Record<string, Message[]> = {};
    messages.forEach((message) => {
      const roomId = message.roomId || "";
      if (!roomId) return;
      if (!map[roomId]) map[roomId] = [];
      map[roomId].push(message);
    });
    return map;
  }, [messages]);

  const roomsWithPreview = useMemo(() => {
    return roomItems.map((room) => {
      const roomMessages = messagesByRoom[room.id] ?? [];
      const lastMessage = roomMessages[roomMessages.length - 1];
      return {
        ...room,
        lastMessage,
      };
    });
  }, [roomItems, messagesByRoom]);

  const visibleRooms = useMemo(() => {
    const token = search.trim().toLowerCase();
    if (!token) return roomsWithPreview;
    const normalizedToken = token.startsWith("@") ? token.slice(1) : token;
    return roomsWithPreview.filter(
      (room) =>
        room.name.toLowerCase().includes(token) ||
        room.handle.toLowerCase().includes(normalizedToken),
    );
  }, [roomsWithPreview, search]);

  const visibleMessages = useMemo(
    () => messages.filter((message) => message.roomId === selectedRoom),
    [messages, selectedRoom],
  );

  const selectedRoomMeta = roomItems.find((room) => room.id === selectedRoom);
  const selectedRoomName = selectedRoomMeta?.name || "Direct Message";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages.length, selectedRoom]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first.");
      return;
    }
    if (!selectedRoom) {
      alert("Pick a username first.");
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
    <div className="min-h-screen bg-[#0f1115] text-white">
      <Navbar />
      <main className="mx-auto grid h-[calc(100vh-4rem)] w-full max-w-7xl gap-4 px-4 py-4 md:grid-cols-[320px_1fr]">
        <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#2a2f38] bg-[#11161d]">
          <div className="border-b border-[#222833] p-4">
            <h2 className="text-lg font-semibold text-[#7dd3fc]">Chats</h2>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search username or @handle"
              className="mt-3 w-full rounded-xl border border-[#2c3442] bg-[#0c1117] px-3 py-2 text-sm outline-none focus:border-[#38bdf8]"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {visibleRooms.length ? (
              visibleRooms.map((room) => {
                const isActive = selectedRoom === room.id;
                const preview = room.lastMessage?.text || "Start chatting";
                const previewTime = formatMessageTime(room.lastMessage?.createdAt?.seconds);
                return (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoom(room.id)}
                    className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                      isActive ? "bg-[#1f2a38]" : "hover:bg-[#18202a]"
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0b2a3b] text-sm font-semibold text-[#7dd3fc]">
                      {room.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{room.name}</p>
                        <span className="text-[10px] text-gray-500">{previewTime}</span>
                      </div>
                      <p className="truncate text-xs text-gray-400">@{room.handle} | {preview}</p>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="rounded-xl border border-[#2c3442] bg-[#0c1117] p-3 text-xs text-gray-400">
                No users found. Try searching with username.
              </p>
            )}
          </div>
        </aside>

        <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#2a2f38] bg-[#0f141b]">
          <div className="flex items-center justify-between border-b border-[#222833] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#7dd3fc]">{selectedRoomName}</p>
              <p className="text-xs text-gray-500">
                {selectedRoomMeta ? `Chatting with @${selectedRoomMeta.handle}` : "Direct message"}
              </p>
            </div>
          </div>

          {error ? <p className="px-4 pt-3 text-sm text-red-300">{error}</p> : null}

          <div className="flex-1 space-y-2 overflow-y-auto bg-[#0b1016] p-4">
            {selectedRoom ? (
              visibleMessages.length ? (
                visibleMessages.map((message) => {
                  const mine = message.senderId === currentUserId;
                  return (
                    <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${
                          mine ? "bg-[#1d4ed8] text-white" : "bg-[#1b2430] text-gray-100"
                        }`}
                      >
                        {!mine ? <p className="mb-0.5 text-[11px] text-[#7dd3fc]">{message.senderName || "Campus User"}</p> : null}
                        <p className="whitespace-pre-wrap break-words">{message.text}</p>
                        <p className={`mt-1 text-[10px] ${mine ? "text-blue-100" : "text-gray-400"}`}>
                          {formatMessageTime(message.createdAt?.seconds)}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-gray-500">No messages yet. Say hi.</p>
                </div>
              )
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-gray-500">Choose a username from the left to start chatting.</p>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={send} className="border-t border-[#222833] bg-[#0f141b] p-3">
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={selectedRoom ? "Type a message" : "Select a user to start DM"}
                disabled={!selectedRoom}
                className="flex-1 rounded-full border border-[#2c3442] bg-[#0a0f15] px-4 py-2 text-sm outline-none focus:border-[#38bdf8] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!selectedRoom}
                className="rounded-full bg-[#0ea5e9] px-5 py-2 text-sm font-semibold text-[#041018] hover:bg-[#38bdf8] disabled:opacity-60"
              >
                Send
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
