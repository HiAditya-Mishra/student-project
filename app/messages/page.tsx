"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import { normalizeHandle, resolveAvatar } from "@/lib/profile";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";

type Message = {
  id: string;
  roomId?: string;
  text?: string;
  imageUrl?: string;
  senderId?: string;
  senderName?: string;
  createdAt?: { seconds?: number };
  editedAt?: { seconds?: number };
};

type UserItem = {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string;
  avatarSeed?: string;
};

type RoomItem = {
  id: string;
  name: string;
  handle: string;
  kind: "dm";
  peerId?: string;
  avatarUrl?: string;
  avatarSeed?: string;
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
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingImageUrl, setEditingImageUrl] = useState("");
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const optimizeImage = async (file: File) => {
    const raw = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });

    const source = new Image();
    source.src = raw;
    await new Promise<void>((resolve, reject) => {
      source.onload = () => resolve();
      source.onerror = () => reject(new Error("Failed to load image"));
    });

    const maxSize = 1000;
    const scale = Math.min(1, maxSize / Math.max(source.naturalWidth, source.naturalHeight));
    const width = Math.max(1, Math.round(source.naturalWidth * scale));
    const height = Math.max(1, Math.round(source.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return raw;
    ctx.drawImage(source, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  };

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
        const data = docSnapshot.data() as {
          nickname?: string;
          handle?: string;
          avatarUrl?: string;
          avatarSeed?: string;
        };
        return {
          id: docSnapshot.id,
          name: (data.nickname || "Campus User").trim(),
          handle: normalizeHandle(data.handle || data.nickname || "campus_user"),
          avatarUrl: data.avatarUrl || "",
          avatarSeed: data.avatarSeed || docSnapshot.id,
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
        avatarUrl: user.avatarUrl,
        avatarSeed: user.avatarSeed,
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
    const trimmed = draft.trim();
    if (!trimmed && !draftImageUrl) return;

    try {
      await addDoc(collection(db, "messages"), {
        roomId: selectedRoom,
        text: trimmed,
        imageUrl: draftImageUrl || "",
        senderId: user.uid,
        senderName: user.displayName || "Campus User",
        createdAt: serverTimestamp(),
      });
      setDraft("");
      setDraftImageUrl("");
      setUploadError(null);
    } catch (sendError) {
      console.error(sendError);
      alert("Could not send message.");
    }
  };

  const onDraftImageChange = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file.");
      return;
    }

    try {
      const optimized = await optimizeImage(file);
      setDraftImageUrl(optimized);
      setUploadError(null);
    } catch (imageError) {
      console.error(imageError);
      setUploadError("Could not process image.");
    }
  };

  const startEdit = (message: Message) => {
    setEditingMessageId(message.id);
    setEditingText(message.text || "");
    setEditingImageUrl(message.imageUrl || "");
    setOpenActionMenuId(null);
    setUploadError(null);
  };

  const saveEdit = async () => {
    if (!editingMessageId) return;
    const trimmed = editingText.trim();
    if (!trimmed && !editingImageUrl) {
      alert("Message cannot be empty.");
      return;
    }

    try {
      setSavingMessageId(editingMessageId);
      await updateDoc(doc(db, "messages", editingMessageId), {
        text: trimmed,
        imageUrl: editingImageUrl || "",
        editedAt: serverTimestamp(),
      });
      setEditingMessageId(null);
      setEditingText("");
      setEditingImageUrl("");
    } catch (editError) {
      console.error(editError);
      alert("Could not edit message.");
    } finally {
      setSavingMessageId(null);
    }
  };

  const deleteOwnMessage = async (messageId: string) => {
    try {
      setSavingMessageId(messageId);
      setOpenActionMenuId(null);
      await deleteDoc(doc(db, "messages", messageId));
      if (editingMessageId === messageId) {
        setEditingMessageId(null);
        setEditingText("");
        setEditingImageUrl("");
      }
    } catch (deleteError) {
      console.error(deleteError);
      alert("Could not delete message.");
    } finally {
      setSavingMessageId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="mx-auto grid h-[calc(100vh-4rem)] w-full max-w-7xl gap-4 px-4 py-4 md:grid-cols-[320px_1fr]">
        <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#2f2f2f] bg-[#141414]">
          <div className="border-b border-[#2a2a2a] p-4">
            <h2 className="text-lg font-semibold text-[#ff8c42]">Chats</h2>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search username or @handle"
              className="mt-3 w-full rounded-xl border border-[#2f2f2f] bg-[#0f0f0f] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {visibleRooms.length ? (
              visibleRooms.map((room) => {
                const isActive = selectedRoom === room.id;
                const preview = room.lastMessage?.text || "Start chatting";
                const previewTime = formatMessageTime(room.lastMessage?.createdAt?.seconds);
                const avatarSrc = resolveAvatar(
                  { avatarUrl: room.avatarUrl, avatarSeed: room.avatarSeed },
                  room.peerId || room.id,
                );
                return (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoom(room.id)}
                    className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                      isActive ? "bg-[#24170f]" : "hover:bg-[#1a1a1a]"
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[#3a2a1c] bg-[#29180f]">
                      <img src={avatarSrc} alt={`${room.name} avatar`} className="h-full w-full object-cover" />
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
              <p className="rounded-xl border border-[#2f2f2f] bg-[#0f0f0f] p-3 text-xs text-gray-400">
                No users found. Try searching with username.
              </p>
            )}
          </div>
        </aside>

        <section
          className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#2f2f2f] bg-[#121212]"
          onClick={() => setOpenActionMenuId(null)}
        >
          <div className="flex items-center justify-between border-b border-[#2a2a2a] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#ff8c42]">{selectedRoomName}</p>
              <p className="text-xs text-gray-500">
                {selectedRoomMeta ? `Chatting with @${selectedRoomMeta.handle}` : "Direct message"}
              </p>
            </div>
          </div>

          {error ? <p className="px-4 pt-3 text-sm text-red-300">{error}</p> : null}

          <div className="flex-1 space-y-2 overflow-y-auto bg-[#0f0f0f] p-4">
            {selectedRoom ? (
              visibleMessages.length ? (
                visibleMessages.map((message) => {
                  const mine = message.senderId === currentUserId;
                  const inEditMode = editingMessageId === message.id;
                  return (
                    <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${
                          mine ? "bg-[#ff6a00] text-white" : "bg-[#1b1b1b] text-gray-100"
                        }`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {!mine ? <p className="mb-0.5 text-[11px] text-[#ff9e58]">{message.senderName || "Campus User"}</p> : null}
                        {inEditMode ? (
                          <div className="space-y-2">
                            <input
                              value={editingText}
                              onChange={(event) => setEditingText(event.target.value)}
                              className="w-full rounded border border-white/30 bg-black/20 px-2 py-1 text-sm outline-none"
                            />
                            {editingImageUrl ? (
                              <img
                                src={editingImageUrl}
                                alt="Edited attachment"
                                className="max-h-52 w-full rounded-lg border border-white/25 object-cover"
                              />
                            ) : null}
                            <div className="flex items-center gap-2">
                              <label className="cursor-pointer rounded border border-white/30 px-2 py-1 text-[11px]">
                                Image
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (event) => {
                                    const file = event.target.files?.[0] ?? null;
                                    if (!file) return;
                                    try {
                                      const optimized = await optimizeImage(file);
                                      setEditingImageUrl(optimized);
                                    } catch (imageError) {
                                      console.error(imageError);
                                      setUploadError("Could not process image.");
                                    }
                                  }}
                                />
                              </label>
                              {editingImageUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setEditingImageUrl("")}
                                  className="rounded border border-white/30 px-2 py-1 text-[11px]"
                                >
                                  Remove Image
                                </button>
                              ) : null}
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void saveEdit()}
                                disabled={savingMessageId === message.id}
                                className="rounded border border-white/30 px-2 py-1 text-[11px]"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMessageId(null);
                                  setEditingText("");
                                  setEditingImageUrl("");
                                }}
                                className="rounded border border-white/30 px-2 py-1 text-[11px]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {message.text ? <p className="whitespace-pre-wrap break-words">{message.text}</p> : null}
                            {message.imageUrl ? (
                              <img
                                src={message.imageUrl}
                                alt="Message attachment"
                                className="mt-1 max-h-56 w-full rounded-lg border border-white/20 object-cover"
                              />
                            ) : null}
                          </>
                        )}
                        {mine && !inEditMode ? (
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p className="text-[10px] text-orange-100">
                              {formatMessageTime(message.createdAt?.seconds)}{message.editedAt ? " (edited)" : ""}
                            </p>
                            <div className="relative">
                              <button
                                type="button"
                                aria-label="Open message actions"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenActionMenuId((prev) => (prev === message.id ? null : message.id));
                                }}
                                className="rounded-md border border-white/30 px-1.5 py-0.5 text-[10px] leading-none text-white/90 hover:bg-white/10"
                              >
                                v
                              </button>
                              {openActionMenuId === message.id ? (
                                <div className="absolute right-0 z-20 mt-1 w-28 rounded-lg border border-[#2f2f2f] bg-[#151515] p-1 shadow-lg">
                                  <button
                                    type="button"
                                    onClick={() => startEdit(message)}
                                    className="w-full rounded px-2 py-1 text-left text-[11px] text-gray-100 hover:bg-[#232323]"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void deleteOwnMessage(message.id)}
                                    disabled={savingMessageId === message.id}
                                    className="mt-1 w-full rounded px-2 py-1 text-left text-[11px] text-red-300 hover:bg-[#2a1616] disabled:opacity-60"
                                  >
                                    {savingMessageId === message.id ? "Deleting..." : "Delete"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <p className={`mt-1 text-[10px] ${mine ? "text-orange-100" : "text-gray-400"}`}>
                            {formatMessageTime(message.createdAt?.seconds)}{message.editedAt ? " (edited)" : ""}
                          </p>
                        )}
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

          <form onSubmit={send} className="border-t border-[#2a2a2a] bg-[#121212] p-3">
            {draftImageUrl ? (
              <div className="mb-2 flex items-center gap-2">
                <img src={draftImageUrl} alt="Draft attachment" className="h-14 w-14 rounded-lg border border-[#2f2f2f] object-cover" />
                <button
                  type="button"
                  onClick={() => setDraftImageUrl("")}
                  className="rounded border border-[#2f2f2f] px-2 py-1 text-[11px] text-gray-300"
                >
                  Remove image
                </button>
              </div>
            ) : null}
            <div className="flex gap-2">
              <label className="cursor-pointer rounded-full border border-[#2f2f2f] bg-[#0f0f0f] px-3 py-2 text-xs text-gray-200">
                Image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={!selectedRoom}
                  onChange={(event) => void onDraftImageChange(event.target.files?.[0] ?? null)}
                />
              </label>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={selectedRoom ? "Type a message" : "Select a user to start DM"}
                disabled={!selectedRoom}
                className="flex-1 rounded-full border border-[#2f2f2f] bg-[#0f0f0f] px-4 py-2 text-sm outline-none focus:border-[#ff6a00] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!selectedRoom}
                className="rounded-full bg-[#ff6a00] px-5 py-2 text-sm font-semibold text-white hover:bg-[#ff8c42] disabled:opacity-60"
              >
                Send
              </button>
            </div>
            {uploadError ? <p className="mt-2 text-xs text-red-300">{uploadError}</p> : null}
          </form>
        </section>
      </main>
    </div>
  );
}
