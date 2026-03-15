"use client";

export const dynamic = "force-dynamic";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import { normalizeHandle, resolveAvatar } from "@/lib/profile";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useSearchParams } from "next/navigation";

type Message = {
  id: string;
  text?: string;
  imageUrl?: string;
  senderId?: string;
  senderName?: string;
  createdAt?: { seconds?: number };
  editedAt?: { seconds?: number };
};

type Thread = {
  id: string;
  participantIds: string[];
  requesterId?: string;
  recipientId?: string;
  status?: "active" | "request";
  lastMessage?: {
    text?: string;
    senderId?: string;
    createdAt?: { seconds?: number };
  };
  createdAt?: { seconds?: number };
};

type UserItem = {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string;
  avatarSeed?: string;
  followingUsers?: string[];
  followingCommunities?: string[];
  publicProfile?: boolean;
};

type ProfileLite = {
  publicProfile?: boolean;
  followingUsers?: string[];
  followingCommunities?: string[];
};

function roomIdForPair(a: string, b: string) {
  return [a, b].sort().join("__");
}

function formatMessageTime(seconds?: number) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dateKeyFromSeconds(seconds?: number) {
  if (!seconds) return "";
  const date = new Date(seconds * 1000);
  return date.toLocaleDateString([], { year: "numeric", month: "2-digit", day: "2-digit" });
}

function dayLabelFromSeconds(seconds?: number) {
  if (!seconds) return "";
  const date = new Date(seconds * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function sharedCommunity(a?: string[], b?: string[]) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return false;
  const set = new Set(a);
  return b.some((id) => set.has(id));
}

export default function MessagesPage() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [users, setUsers] = useState<Record<string, UserItem>>({});
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [selectedPeerId, setSelectedPeerId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [profile, setProfile] = useState<ProfileLite>({});
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingImageUrl, setEditingImageUrl] = useState("");
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"inbox" | "requests">("inbox");
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

  const readOnlyMode = profile.publicProfile === false;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUserId(user?.uid || "");
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    const loadProfile = async () => {
      const snapshot = await getDoc(doc(db, "users", currentUserId));
      const data = (snapshot.exists() ? snapshot.data() : {}) as ProfileLite;
      setProfile({
        publicProfile: data.publicProfile ?? true,
        followingUsers: Array.isArray(data.followingUsers) ? data.followingUsers : [],
        followingCommunities: Array.isArray(data.followingCommunities) ? data.followingCommunities : [],
      });
    };
    void loadProfile();
  }, [currentUserId]);

  useEffect(() => {
    const loadUsers = async () => {
      const snapshot = await getDocs(collection(db, "users"));
      const nextUsers: Record<string, UserItem> = {};
      snapshot.docs.forEach((docSnapshot) => {
        const data = docSnapshot.data() as {
          nickname?: string;
          handle?: string;
          avatarUrl?: string;
          avatarSeed?: string;
          followingUsers?: string[];
          followingCommunities?: string[];
          publicProfile?: boolean;
        };
        nextUsers[docSnapshot.id] = {
          id: docSnapshot.id,
          name: (data.nickname || "Spheera User").trim(),
          handle: normalizeHandle(data.handle || data.nickname || "spheera_user"),
          avatarUrl: data.avatarUrl || "",
          avatarSeed: data.avatarSeed || docSnapshot.id,
          followingUsers: Array.isArray(data.followingUsers) ? data.followingUsers : [],
          followingCommunities: Array.isArray(data.followingCommunities) ? data.followingCommunities : [],
          publicProfile: data.publicProfile ?? true,
        };
      });
      setUsers(nextUsers);
    };
    void loadUsers();
  }, []);

  useEffect(() => {
    if (!currentUserId || readOnlyMode) {
      setThreads([]);
      return;
    }
    const unsubscribe = onSnapshot(
      query(collection(db, "dmThreads"), where("participantIds", "array-contains", currentUserId), orderBy("updatedAt", "desc")),
      (snapshot) => {
        setError(null);
        const nextThreads: Thread[] = snapshot.docs
          .map((docSnapshot) => ({
            id: docSnapshot.id,
            ...(docSnapshot.data() as Omit<Thread, "id">),
          }))
          .filter((thread) => thread.participantIds?.includes(currentUserId));
        setThreads(nextThreads);
      },
      (snapshotError) => {
        console.error(snapshotError);
        setError("Messages are blocked by Firestore rules.");
      },
    );

    return () => unsubscribe();
  }, [currentUserId, readOnlyMode]);

  useEffect(() => {
    if (!selectedThreadId || readOnlyMode) {
      setMessages([]);
      return;
    }
    const unsubscribe = onSnapshot(
      query(collection(db, "dmThreads", selectedThreadId, "messages"), orderBy("createdAt", "asc")),
      (snapshot) => {
        setMessages(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...(docSnapshot.data() as Omit<Message, "id">),
          })),
        );
      },
      (snapshotError) => {
        console.error(snapshotError);
        setMessages([]);
      },
    );
    return () => unsubscribe();
  }, [selectedThreadId, readOnlyMode]);

  useEffect(() => {
    const threadParam = searchParams?.get("thread") ?? "";
    if (threadParam) {
      setSelectedThreadId(threadParam);
    }
  }, [searchParams]);

  const threadsById = useMemo(() => {
    const map: Record<string, Thread> = {};
    threads.forEach((thread) => {
      map[thread.id] = thread;
    });
    return map;
  }, [threads]);
  const mutualUsers = useMemo(() => {
    if (!currentUserId) return [] as UserItem[];
    const following = new Set(profile.followingUsers ?? []);
    return Object.values(users)
      .filter((user) => user.id !== currentUserId)
      .filter((user) => (user.publicProfile ?? true))
      .filter((user) => following.has(user.id) && (user.followingUsers ?? []).includes(currentUserId));
  }, [users, currentUserId, profile.followingUsers]);

  const sharedCommunityUsers = useMemo(() => {
    if (!currentUserId) return [] as UserItem[];
    const following = new Set(profile.followingUsers ?? []);
    return Object.values(users)
      .filter((user) => user.id !== currentUserId)
      .filter((user) => (user.publicProfile ?? true))
      .filter((user) => !following.has(user.id) || !(user.followingUsers ?? []).includes(currentUserId))
      .filter((user) => sharedCommunity(profile.followingCommunities, user.followingCommunities));
  }, [users, currentUserId, profile.followingUsers, profile.followingCommunities]);

  const activeThreads = threads.filter((thread) => thread.status === "active");
  const incomingRequests = threads.filter(
    (thread) => thread.status === "request" && thread.recipientId === currentUserId,
  );
  const sentRequests = threads.filter(
    (thread) => thread.status === "request" && thread.requesterId === currentUserId,
  );

  const inboxItems = useMemo(() => {
    const threadPeers = new Set(
      activeThreads
        .map((thread) => thread.participantIds?.find((id) => id !== currentUserId))
        .filter(Boolean) as string[],
    );

    const mutualWithoutThread = mutualUsers
      .filter((user) => !threadPeers.has(user.id))
      .map((user) => ({
        id: `mutual:${user.id}`,
        peerId: user.id,
        name: user.name,
        handle: user.handle,
        kind: "mutual" as const,
        lastMessage: undefined,
      }));

    const threadItems = activeThreads.map((thread) => {
      const peerId = thread.participantIds?.find((id) => id !== currentUserId) || "";
      const peer = users[peerId];
      return {
        id: thread.id,
        peerId,
        name: peer?.name || "Spheera User",
        handle: peer?.handle || "spheera_user",
        kind: "thread" as const,
        lastMessage: thread.lastMessage,
      };
    });

    return [...threadItems, ...mutualWithoutThread];
  }, [activeThreads, mutualUsers, currentUserId, users]);

  const requestableUsers = useMemo(() => {
    const existingPeerIds = new Set(
      threads
        .map((thread) => thread.participantIds?.find((id) => id !== currentUserId))
        .filter(Boolean) as string[],
    );
    return sharedCommunityUsers.filter((user) => !existingPeerIds.has(user.id));
  }, [sharedCommunityUsers, threads, currentUserId]);

  const visibleInboxItems = useMemo(() => {
    const token = search.trim().toLowerCase();
    if (!token) return inboxItems;
    const normalizedToken = token.startsWith("@") ? token.slice(1) : token;
    return inboxItems.filter(
      (room) =>
        room.name.toLowerCase().includes(token) ||
        room.handle.toLowerCase().includes(normalizedToken),
    );
  }, [inboxItems, search]);

  const visibleRequestable = useMemo(() => {
    const token = search.trim().toLowerCase();
    if (!token) return [] as UserItem[];
    const normalizedToken = token.startsWith("@") ? token.slice(1) : token;
    return requestableUsers.filter(
      (user) =>
        user.name.toLowerCase().includes(token) ||
        user.handle.toLowerCase().includes(normalizedToken),
    );
  }, [requestableUsers, search]);

  const groupedMessages = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: Message[] }> = [];
    messages.forEach((message) => {
      const key = dateKeyFromSeconds(message.createdAt?.seconds);
      const label = dayLabelFromSeconds(message.createdAt?.seconds);
      const last = groups[groups.length - 1];
      if (!last || last.key !== key) {
        groups.push({ key, label, items: [message] });
      } else {
        last.items.push(message);
      }
    });
    return groups;
  }, [messages]);

  const selectedThread = selectedThreadId ? threadsById[selectedThreadId] : undefined;
  const selectedPeerFromThread = selectedThread?.participantIds?.find((id) => id !== currentUserId) || "";
  const activePeerId = selectedPeerId || selectedPeerFromThread;
  const activePeer = activePeerId ? users[activePeerId] : undefined;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedThreadId]);

  const ensureActiveThread = async (peerId: string) => {
    if (!currentUserId || readOnlyMode) return "";
    const threadId = roomIdForPair(currentUserId, peerId);
    if (threadsById[threadId]) {
      return threadId;
    }
    await setDoc(doc(db, "dmThreads", threadId), {
      participantIds: [currentUserId, peerId],
      requesterId: currentUserId,
      recipientId: peerId,
      status: "active",
      origin: "mutual",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: null,
    });
    return threadId;
  };

  const ensureRequestThread = async (peerId: string) => {
    if (!currentUserId || readOnlyMode) return "";
    const threadId = roomIdForPair(currentUserId, peerId);
    if (threadsById[threadId]) {
      return threadId;
    }
    await setDoc(doc(db, "dmThreads", threadId), {
      participantIds: [currentUserId, peerId],
      requesterId: currentUserId,
      recipientId: peerId,
      status: "request",
      origin: "community",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: null,
    });
    return threadId;
  };

  const handleSelectInboxItem = async (item: { id: string; peerId: string; kind: "thread" | "mutual" }) => {
    if (readOnlyMode) return;
    setSelectedPeerId(item.peerId);
    if (item.kind === "thread") {
      setSelectedThreadId(item.id);
      return;
    }
    const threadId = await ensureActiveThread(item.peerId);
    setSelectedThreadId(threadId);
  };

  const handleSelectRequestable = async (peerId: string) => {
    if (readOnlyMode) return;
    const threadId = await ensureRequestThread(peerId);
    setSelectedPeerId(peerId);
    setSelectedThreadId(threadId);
    setActiveTab("requests");
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first.");
      return;
    }
    if (readOnlyMode) {
      alert("Messaging is disabled in incognito mode.");
      return;
    }
    if (!activePeerId) {
      alert("Pick a username first.");
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed && !draftImageUrl) return;

    let threadId = selectedThreadId;
    if (!threadId) {
      const peer = users[activePeerId];
      const isMutual = mutualUsers.some((userItem) => userItem.id === activePeerId);
      const canRequest = sharedCommunity(profile.followingCommunities, peer?.followingCommunities);
      if (isMutual) threadId = await ensureActiveThread(activePeerId);
      else if (canRequest) threadId = await ensureRequestThread(activePeerId);
      else {
        alert("Messaging is only available for mutual follows or shared communities.");
        return;
      }
      setSelectedThreadId(threadId);
    }

    const thread = threadsById[threadId];
    if (thread?.status === "request" && thread.requesterId !== user.uid) {
      alert("Accept the request to reply.");
      return;
    }

    try {
      await addDoc(collection(db, "dmThreads", threadId, "messages"), {
        text: trimmed,
        imageUrl: draftImageUrl || "",
        senderId: user.uid,
        senderName: user.displayName || "Spheera User",
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "dmThreads", threadId), {
        lastMessage: {
          text: trimmed || (draftImageUrl ? "Image" : ""),
          senderId: user.uid,
          createdAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
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
    if (!editingMessageId || !selectedThreadId) return;
    const trimmed = editingText.trim();
    if (!trimmed && !editingImageUrl) {
      alert("Message cannot be empty.");
      return;
    }

    try {
      setSavingMessageId(editingMessageId);
      await updateDoc(doc(db, "dmThreads", selectedThreadId, "messages", editingMessageId), {
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
    if (!selectedThreadId) return;
    try {
      setSavingMessageId(messageId);
      setOpenActionMenuId(null);
      await deleteDoc(doc(db, "dmThreads", selectedThreadId, "messages", messageId));
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

  const acceptRequest = async (threadId: string) => {
    try {
      await updateDoc(doc(db, "dmThreads", threadId), {
        status: "active",
        updatedAt: serverTimestamp(),
      });
      setActiveTab("inbox");
      setSelectedThreadId(threadId);
    } catch (acceptError) {
      console.error(acceptError);
      alert("Could not accept request.");
    }
  };

  const ignoreRequest = async (threadId: string) => {
    try {
      await deleteDoc(doc(db, "dmThreads", threadId));
      if (selectedThreadId === threadId) {
        setSelectedThreadId("");
        setSelectedPeerId("");
      }
    } catch (ignoreError) {
      console.error(ignoreError);
      alert("Could not ignore request.");
    }
  };

  const selectedThreadName = activePeer?.name || "Direct Message";
  const selectedThreadHandle = activePeer?.handle || "";
  const selectedThreadAvatar = activePeer
    ? resolveAvatar({ avatarUrl: activePeer.avatarUrl, avatarSeed: activePeer.avatarSeed }, activePeer.id)
    : "";
  const canSendMessage =
    Boolean(activePeerId) &&
    !readOnlyMode &&
    (!selectedThread || selectedThread.status !== "request" || selectedThread.requesterId === currentUserId);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="mx-auto grid h-[calc(100vh-4rem)] w-full max-w-7xl gap-4 px-4 py-4 md:grid-cols-[320px_1fr]">
        <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#2f2f2f] bg-[#141414]">
          <div className="border-b border-[#2a2a2a] p-4">
            <h2 className="text-lg font-semibold text-[#ff8c42]">Messages</h2>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("inbox")}
                className={`rounded-full px-3 py-1 text-xs ${activeTab === "inbox" ? "bg-[#ff6a00]" : "border border-[#2f2f2f]"}`}
              >
                Inbox
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("requests")}
                className={`rounded-full px-3 py-1 text-xs ${activeTab === "requests" ? "bg-[#ff6a00]" : "border border-[#2f2f2f]"}`}
              >
                Requests
              </button>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search username or @handle"
              className="mt-3 w-full rounded-xl border border-[#2f2f2f] bg-[#0f0f0f] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
              disabled={readOnlyMode}
            />
          </div>

          {readOnlyMode ? (
            <div className="p-4 text-xs text-gray-400">
              Messaging is disabled while your Identity Toggle is anonymous.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-2">
              {activeTab === "inbox" ? (
                <>
                  {visibleInboxItems.length ? (
                    visibleInboxItems.map((room) => {
                      const isActive = selectedThreadId === room.id || (room.kind === "mutual" && activePeerId === room.peerId);
                      const preview = room.lastMessage?.text || "Start chatting";
                      const previewTime = formatMessageTime(room.lastMessage?.createdAt?.seconds);
                      const peer = users[room.peerId];
                      const avatarSrc = resolveAvatar(
                        { avatarUrl: peer?.avatarUrl, avatarSeed: peer?.avatarSeed },
                        room.peerId,
                      );
                      return (
                        <button
                          key={room.id}
                          onClick={() => void handleSelectInboxItem(room)}
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
                      No active conversations yet.
                    </p>
                  )}

                  {visibleRequestable.length ? (
                    <div className="mt-3 rounded-xl border border-[#2f2f2f] bg-[#0f0f0f] p-3">
                      <p className="text-[11px] uppercase text-gray-500">Shared community</p>
                      <div className="mt-2 space-y-2">
                        {visibleRequestable.map((user) => {
                          const avatarSrc = resolveAvatar(
                            { avatarUrl: user.avatarUrl, avatarSeed: user.avatarSeed },
                            user.id,
                          );
                          return (
                            <button
                              key={user.id}
                              onClick={() => void handleSelectRequestable(user.id)}
                              className="flex w-full items-center gap-2 rounded-lg border border-[#262626] px-2 py-1 text-left text-xs text-gray-200 hover:border-[#ff6a00]"
                            >
                              <img src={avatarSrc} alt={user.name} className="h-7 w-7 rounded-full border border-[#3a2a1c]" />
                              <span className="truncate">{user.name}</span>
                              <span className="truncate text-[11px] text-gray-500">@{user.handle}</span>
                              <span className="ml-auto text-[11px] text-[#ff8c42]">Request</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="space-y-3">
                  {incomingRequests.length ? (
                    incomingRequests.map((thread) => {
                      const peerId = thread.participantIds?.find((id) => id !== currentUserId) || "";
                      const peer = users[peerId];
                      const avatarSrc = resolveAvatar(
                        { avatarUrl: peer?.avatarUrl, avatarSeed: peer?.avatarSeed },
                        peerId,
                      );
                      return (
                        <div key={thread.id} className="rounded-xl border border-[#2f2f2f] bg-[#0f0f0f] p-3">
                          <div className="flex items-center gap-3">
                            <img src={avatarSrc} alt={peer?.name || "User"} className="h-10 w-10 rounded-full border border-[#3a2a1c]" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{peer?.name || "Spheera User"}</p>
                              <p className="truncate text-xs text-gray-400">@{peer?.handle || "spheera_user"}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => void acceptRequest(thread.id)}
                              className="rounded-lg bg-[#ff6a00] px-3 py-1 text-xs font-semibold"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => void ignoreRequest(thread.id)}
                              className="rounded-lg border border-[#2f2f2f] px-3 py-1 text-xs text-gray-300"
                            >
                              Ignore
                            </button>
                            <button
                              onClick={() => {
                                setSelectedThreadId(thread.id);
                                setSelectedPeerId(peerId);
                              }}
                              className="ml-auto rounded-lg border border-[#2f2f2f] px-3 py-1 text-xs text-gray-300"
                            >
                              View
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="rounded-xl border border-[#2f2f2f] bg-[#0f0f0f] p-3 text-xs text-gray-400">
                      No incoming requests.
                    </p>
                  )}

                  {sentRequests.length ? (
                    <div className="rounded-xl border border-[#2f2f2f] bg-[#0f0f0f] p-3">
                      <p className="text-[11px] uppercase text-gray-500">Sent requests</p>
                      <div className="mt-2 space-y-2">
                        {sentRequests.map((thread) => {
                          const peerId = thread.participantIds?.find((id) => id !== currentUserId) || "";
                          const peer = users[peerId];
                          return (
                            <button
                              key={thread.id}
                              onClick={() => {
                                setSelectedThreadId(thread.id);
                                setSelectedPeerId(peerId);
                              }}
                              className="flex w-full items-center justify-between rounded-lg border border-[#262626] px-2 py-2 text-left text-xs text-gray-200 hover:border-[#ff6a00]"
                            >
                              <span className="truncate">{peer?.name || "Spheera User"}</span>
                              <span className="text-[11px] text-gray-500">Pending</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </aside>

        <section
          className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#2f2f2f] bg-[#121212]"
          onClick={() => setOpenActionMenuId(null)}
        >
          <div className="flex items-center justify-between border-b border-[#2a2a2a] px-4 py-3">
            <div className="flex items-center gap-3">
              {selectedThreadAvatar ? (
                <img src={selectedThreadAvatar} alt={selectedThreadName} className="h-9 w-9 rounded-full border border-[#3a2a1c]" />
              ) : null}
              <div>
                <p className="text-sm font-semibold text-[#ff8c42]">{selectedThreadName}</p>
                <p className="text-xs text-gray-500">
                  {selectedThreadHandle ? `Chatting with @${selectedThreadHandle}` : "Direct message"}
                </p>
              </div>
            </div>
            {selectedThread?.status === "request" && selectedThread?.recipientId === currentUserId ? (
              <div className="flex gap-2">
                <button
                  onClick={() => void acceptRequest(selectedThread.id)}
                  className="rounded-lg bg-[#ff6a00] px-3 py-1 text-xs font-semibold"
                >
                  Accept
                </button>
                <button
                  onClick={() => void ignoreRequest(selectedThread.id)}
                  className="rounded-lg border border-[#2f2f2f] px-3 py-1 text-xs text-gray-300"
                >
                  Ignore
                </button>
              </div>
            ) : null}
          </div>

          {error ? <p className="px-4 pt-3 text-sm text-red-300">{error}</p> : null}

          <div className="flex-1 space-y-2 overflow-y-auto bg-[#0f0f0f] p-4">
            {selectedThreadId ? (
              groupedMessages.length ? (
                groupedMessages.map((group) => (
                  <div key={group.key || group.label} className="space-y-2">
                    <div className="flex items-center justify-center">
                      <span className="rounded-full border border-[#2a2a2a] bg-[#151515] px-3 py-1 text-[11px] text-gray-400">
                        {group.label}
                      </span>
                    </div>
                    {group.items.map((message) => {
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
                            {!mine ? <p className="mb-0.5 text-[11px] text-[#ff9e58]">{message.senderName || "Spheera User"}</p> : null}
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
                    })}
                  </div>
                ))
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-gray-500">No messages yet. Say hi.</p>
                </div>
              )
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-gray-500">Choose a conversation from the left to start.</p>
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
                  disabled={!canSendMessage}
                  onChange={(event) => void onDraftImageChange(event.target.files?.[0] ?? null)}
                />
              </label>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={activePeerId ? "Type a message" : "Select a user to start DM"}
                disabled={!canSendMessage}
                className="flex-1 rounded-full border border-[#2f2f2f] bg-[#0f0f0f] px-4 py-2 text-sm outline-none focus:border-[#ff6a00] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!canSendMessage}
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



