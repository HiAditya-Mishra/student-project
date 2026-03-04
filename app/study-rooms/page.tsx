"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

type StudyRoom = {
  id: string;
  name?: string;
  topic?: string;
  goal?: string;
  hostName?: string;
  participants?: string[];
  attendanceLog?: string[];
  sharedNotes?: string;
};

type RoomMessage = {
  id: string;
  text?: string;
  senderId?: string;
  senderName?: string;
  createdAt?: { seconds?: number };
};

type RoomResource = {
  id: string;
  title?: string;
  url?: string;
  description?: string;
  kind?: "link" | "doc" | "notes";
  sharedById?: string;
  sharedByName?: string;
  createdAt?: { seconds?: number };
};

function usePomodoro(initialMinutes = 25) {
  const [secondsLeft, setSecondsLeft] = useState(initialMinutes * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (secondsLeft === 0) setRunning(false);
  }, [secondsLeft]);

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return {
    label: `${minutes}:${seconds}`,
    running,
    start: () => setRunning(true),
    pause: () => setRunning(false),
    reset: (mins = initialMinutes) => {
      setRunning(false);
      setSecondsLeft(mins * 60);
    },
  };
}

function formatMessageTime(seconds?: number) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function StudyRoomsPage() {
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [roomName, setRoomName] = useState("");
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [creating, setCreating] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");

  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const [resources, setResources] = useState<RoomResource[]>([]);
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");
  const [sharingResource, setSharingResource] = useState(false);

  const [sharedNotes, setSharedNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const timer = usePomodoro(25);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "studyRooms"),
      (snapshot) => {
        setRoomsError(null);
        const nextRooms: StudyRoom[] = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Omit<StudyRoom, "id">),
        }));
        setRooms(nextRooms);
        setSelectedRoomId((prev) => {
          if (prev && nextRooms.some((room) => room.id === prev)) return prev;
          return nextRooms[0]?.id ?? "";
        });
      },
      (error) => {
        console.error(error);
        setRoomsError(
          error.code === "permission-denied"
            ? "Study rooms are blocked by Firestore rules."
            : "Failed to load study rooms.",
        );
        setRooms([]);
        setSelectedRoomId("");
      },
    );

    return () => unsubscribe();
  }, []);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  useEffect(() => {
    if (!selectedRoomId) {
      setMessages([]);
      return;
    }

    const unsubscribe = onSnapshot(
      query(collection(db, "studyRooms", selectedRoomId, "messages"), orderBy("createdAt", "asc")),
      (snapshot) => {
        setMessages(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...(docSnapshot.data() as Omit<RoomMessage, "id">),
          })),
        );
      },
      (error) => {
        console.error(error);
        setMessages([]);
      },
    );

    return () => unsubscribe();
  }, [selectedRoomId]);

  useEffect(() => {
    if (!selectedRoomId) {
      setResources([]);
      return;
    }

    const unsubscribe = onSnapshot(
      query(collection(db, "studyRooms", selectedRoomId, "resources"), orderBy("createdAt", "desc")),
      (snapshot) => {
        setResources(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...(docSnapshot.data() as Omit<RoomResource, "id">),
          })),
        );
      },
      (error) => {
        console.error(error);
        setResources([]);
      },
    );

    return () => unsubscribe();
  }, [selectedRoomId]);

  useEffect(() => {
    setSharedNotes(selectedRoom?.sharedNotes || "");
  }, [selectedRoom?.id, selectedRoom?.sharedNotes]);

  const createRoom = async (event: FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      alert("Please login to create a study room.");
      return;
    }
    if (!roomName.trim()) {
      alert("Room name is required.");
      return;
    }

    try {
      setCreating(true);
      await addDoc(collection(db, "studyRooms"), {
        name: roomName.trim(),
        topic: topic.trim(),
        goal: goal.trim(),
        hostName: user.displayName || "Host",
        participants: [user.uid],
        attendanceLog: [`${new Date().toLocaleString()} - ${user.displayName || "User"} joined`],
        sharedNotes: "",
        createdAt: serverTimestamp(),
      });
      setRoomName("");
      setTopic("");
      setGoal("");
    } catch (error) {
      console.error(error);
      alert("Could not create room.");
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = async (roomId: string) => {
    const user = auth.currentUser;
    if (!user) {
      alert("Please login to join rooms.");
      return;
    }

    try {
      await updateDoc(doc(db, "studyRooms", roomId), {
        participants: arrayUnion(user.uid),
        attendanceLog: arrayUnion(`${new Date().toLocaleString()} - ${user.displayName || "User"} joined`),
      });
      setSelectedRoomId(roomId);
    } catch (error) {
      console.error(error);
      alert("Could not join room.");
    }
  };

  const leaveRoom = async (roomId: string) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      await updateDoc(doc(db, "studyRooms", roomId), {
        participants: arrayRemove(user.uid),
        attendanceLog: arrayUnion(`${new Date().toLocaleString()} - ${user.displayName || "User"} left`),
      });
    } catch (error) {
      console.error(error);
      alert("Could not leave room.");
    }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user || !selectedRoomId) {
      alert("Join a room to chat.");
      return;
    }
    if (!messageDraft.trim()) return;

    try {
      setSendingMessage(true);
      await addDoc(collection(db, "studyRooms", selectedRoomId, "messages"), {
        text: messageDraft.trim(),
        senderId: user.uid,
        senderName: user.displayName || "Campus User",
        createdAt: serverTimestamp(),
      });
      setMessageDraft("");
    } catch (error) {
      console.error(error);
      alert("Could not send message.");
    } finally {
      setSendingMessage(false);
    }
  };

  const shareResource = async (event: FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user || !selectedRoomId) {
      alert("Join a room first.");
      return;
    }
    if (!resourceTitle.trim()) {
      alert("Resource title is required.");
      return;
    }

    try {
      setSharingResource(true);
      await addDoc(collection(db, "studyRooms", selectedRoomId, "resources"), {
        title: resourceTitle.trim(),
        url: resourceUrl.trim(),
        description: resourceDescription.trim(),
        kind: "link",
        sharedById: user.uid,
        sharedByName: user.displayName || "Campus User",
        createdAt: serverTimestamp(),
      });
      setResourceTitle("");
      setResourceUrl("");
      setResourceDescription("");
    } catch (error) {
      console.error(error);
      alert("Could not share resource.");
    } finally {
      setSharingResource(false);
    }
  };

  const saveSharedNotes = async () => {
    if (!selectedRoom) return;
    try {
      setSavingNotes(true);
      await updateDoc(doc(db, "studyRooms", selectedRoom.id), {
        sharedNotes: sharedNotes.trim(),
      });
    } catch (error) {
      console.error(error);
      alert("Could not save notes.");
    } finally {
      setSavingNotes(false);
    }
  };

  const amInSelectedRoom = Boolean(
    auth.currentUser?.uid &&
      selectedRoom?.participants?.includes(auth.currentUser.uid),
  );

  return (
    <div className="min-h-screen bg-[#0b0d11] text-white">
      <Navbar />
      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4 rounded-2xl border border-[#2b2f38] bg-[#11151c] p-4">
          <div>
            <h2 className="text-lg font-semibold text-[#7dd3fc]">Live Study Rooms</h2>
            <p className="mt-1 text-xs text-gray-400">Join a room to discuss in real time and share resources.</p>
          </div>

          {roomsError ? (
            <div className="rounded-xl border border-red-600/40 bg-red-950/30 p-3 text-xs text-red-200">
              {roomsError}
            </div>
          ) : null}

          <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
            {rooms.length ? (
              rooms.map((room) => (
                <div
                  key={room.id}
                  className={`rounded-xl border p-3 ${
                    selectedRoomId === room.id
                      ? "border-[#38bdf8] bg-[#0f1a26]"
                      : "border-[#2c3442] bg-[#0d1218]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedRoomId(room.id)}
                    className="w-full text-left"
                  >
                    <p className="text-sm font-semibold">{room.name || "Untitled Room"}</p>
                    <p className="mt-1 text-xs text-gray-400">{room.topic || "Open discussion"}</p>
                  </button>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[11px] text-gray-500">{room.participants?.length ?? 0} live</p>
                    <button
                      type="button"
                      onClick={() => void joinRoom(room.id)}
                      className="rounded-md bg-[#0ea5e9] px-2 py-1 text-[11px] font-semibold text-[#041018]"
                    >
                      Join
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-[#2c3442] bg-[#0d1218] p-3 text-sm text-gray-500">No live rooms.</p>
            )}
          </div>

          <form onSubmit={createRoom} className="space-y-2 rounded-xl border border-[#2c3442] bg-[#0d1218] p-3">
            <p className="text-sm font-semibold text-[#7dd3fc]">Create Room</p>
            <input
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="Room name"
              className="w-full rounded-lg border border-[#2c3442] bg-[#0a1016] px-3 py-2 text-sm outline-none focus:border-[#38bdf8]"
            />
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Topic"
              className="w-full rounded-lg border border-[#2c3442] bg-[#0a1016] px-3 py-2 text-sm outline-none focus:border-[#38bdf8]"
            />
            <input
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Session goal"
              className="w-full rounded-lg border border-[#2c3442] bg-[#0a1016] px-3 py-2 text-sm outline-none focus:border-[#38bdf8]"
            />
            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-lg bg-[#0ea5e9] px-3 py-2 text-sm font-semibold text-[#041018] disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create Live Room"}
            </button>
          </form>
        </aside>

        <section className="space-y-4">
          {selectedRoom ? (
            <>
              <div className="rounded-2xl border border-[#2b2f38] bg-[#11151c] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-bold text-[#7dd3fc]">{selectedRoom.name || "Untitled Room"}</h1>
                    <p className="mt-1 text-sm text-gray-300">{selectedRoom.topic || "Open study discussion"}</p>
                    <p className="mt-1 text-xs text-gray-500">Goal: {selectedRoom.goal || "No goal set"}</p>
                  </div>
                  <div className="flex gap-2">
                    {amInSelectedRoom ? (
                      <button
                        type="button"
                        onClick={() => void leaveRoom(selectedRoom.id)}
                        className="rounded-lg border border-[#2c3442] px-3 py-1.5 text-xs hover:border-[#38bdf8]"
                      >
                        Leave Room
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void joinRoom(selectedRoom.id)}
                        className="rounded-lg bg-[#0ea5e9] px-3 py-1.5 text-xs font-semibold text-[#041018]"
                      >
                        Join to Participate
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#2b2f38] bg-[#11151c]">
                    <div className="border-b border-[#242a33] px-4 py-3">
                      <p className="text-sm font-semibold text-[#7dd3fc]">Room Chat</p>
                      <p className="text-xs text-gray-500">Live discussion with everyone in this room.</p>
                    </div>
                    <div className="max-h-[360px] space-y-2 overflow-y-auto bg-[#0b1118] p-3">
                      {messages.length ? (
                        messages.map((message) => {
                          const mine = message.senderId === auth.currentUser?.uid;
                          return (
                            <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${mine ? "bg-[#0369a1]" : "bg-[#1b2531]"}`}>
                                {!mine ? (
                                  <p className="mb-0.5 text-[11px] text-[#7dd3fc]">{message.senderName || "Campus User"}</p>
                                ) : null}
                                <p className="whitespace-pre-wrap break-words">{message.text || ""}</p>
                                <p className="mt-1 text-[10px] text-gray-300">{formatMessageTime(message.createdAt?.seconds)}</p>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-gray-500">No chat yet. Start the discussion.</p>
                      )}
                    </div>
                    <form onSubmit={sendMessage} className="border-t border-[#242a33] p-3">
                      <div className="flex gap-2">
                        <input
                          value={messageDraft}
                          onChange={(event) => setMessageDraft(event.target.value)}
                          placeholder={amInSelectedRoom ? "Discuss with your room..." : "Join room to chat"}
                          disabled={!amInSelectedRoom}
                          className="flex-1 rounded-lg border border-[#2c3442] bg-[#0c1218] px-3 py-2 text-sm outline-none focus:border-[#38bdf8] disabled:opacity-50"
                        />
                        <button
                          type="submit"
                          disabled={!amInSelectedRoom || sendingMessage}
                          className="rounded-lg bg-[#0ea5e9] px-4 py-2 text-sm font-semibold text-[#041018] disabled:opacity-60"
                        >
                          {sendingMessage ? "Sending..." : "Send"}
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="rounded-2xl border border-[#2b2f38] bg-[#11151c] p-4">
                    <p className="text-sm font-semibold text-[#7dd3fc]">Shared Resources</p>
                    <p className="mt-1 text-xs text-gray-500">Links, docs, and references for this room.</p>
                    <form onSubmit={shareResource} className="mt-3 grid gap-2 md:grid-cols-2">
                      <input
                        value={resourceTitle}
                        onChange={(event) => setResourceTitle(event.target.value)}
                        placeholder="Resource title"
                        disabled={!amInSelectedRoom}
                        className="rounded-lg border border-[#2c3442] bg-[#0c1218] px-3 py-2 text-sm outline-none focus:border-[#38bdf8] disabled:opacity-50"
                      />
                      <input
                        value={resourceUrl}
                        onChange={(event) => setResourceUrl(event.target.value)}
                        placeholder="https://... (optional)"
                        disabled={!amInSelectedRoom}
                        className="rounded-lg border border-[#2c3442] bg-[#0c1218] px-3 py-2 text-sm outline-none focus:border-[#38bdf8] disabled:opacity-50"
                      />
                      <input
                        value={resourceDescription}
                        onChange={(event) => setResourceDescription(event.target.value)}
                        placeholder="Quick note"
                        disabled={!amInSelectedRoom}
                        className="md:col-span-2 rounded-lg border border-[#2c3442] bg-[#0c1218] px-3 py-2 text-sm outline-none focus:border-[#38bdf8] disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={!amInSelectedRoom || sharingResource}
                        className="md:col-span-2 rounded-lg border border-[#2c3442] px-3 py-2 text-sm font-semibold hover:border-[#38bdf8] disabled:opacity-60"
                      >
                        {sharingResource ? "Sharing..." : "Share Resource"}
                      </button>
                    </form>

                    <div className="mt-4 space-y-2">
                      {resources.length ? (
                        resources.map((resource) => (
                          <div key={resource.id} className="rounded-xl border border-[#2c3442] bg-[#0c1218] p-3">
                            <p className="text-sm font-semibold">{resource.title || "Untitled resource"}</p>
                            {resource.url ? (
                              <a
                                href={resource.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 block break-all text-xs text-[#7dd3fc] hover:underline"
                              >
                                {resource.url}
                              </a>
                            ) : null}
                            {resource.description ? (
                              <p className="mt-1 text-xs text-gray-300">{resource.description}</p>
                            ) : null}
                            <p className="mt-1 text-[11px] text-gray-500">Shared by {resource.sharedByName || "Member"}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">No resources shared yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#2b2f38] bg-[#11151c] p-4">
                    <p className="text-sm font-semibold text-[#7dd3fc]">Pomodoro</p>
                    <p className="mt-2 text-4xl font-bold">{timer.label}</p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={timer.start} className="rounded bg-[#0ea5e9] px-3 py-1 text-xs font-semibold text-[#041018]">Start</button>
                      <button onClick={timer.pause} className="rounded border border-[#2c3442] px-3 py-1 text-xs">Pause</button>
                      <button onClick={() => timer.reset(25)} className="rounded border border-[#2c3442] px-3 py-1 text-xs">Reset</button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#2b2f38] bg-[#11151c] p-4">
                    <p className="text-sm font-semibold text-[#7dd3fc]">Participants</p>
                    <p className="mt-1 text-xs text-gray-500">{selectedRoom.participants?.length ?? 0} users in room</p>
                    <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                      {(selectedRoom.attendanceLog ?? []).slice(-8).reverse().map((entry) => (
                        <p key={entry} className="text-[11px] text-gray-400">{entry}</p>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#2b2f38] bg-[#11151c] p-4">
                    <p className="text-sm font-semibold text-[#7dd3fc]">Shared Notes</p>
                    <textarea
                      value={sharedNotes}
                      onChange={(event) => setSharedNotes(event.target.value)}
                      disabled={!amInSelectedRoom}
                      placeholder="Write collaborative notes for this room..."
                      className="mt-2 min-h-28 w-full rounded-lg border border-[#2c3442] bg-[#0c1218] px-3 py-2 text-sm outline-none focus:border-[#38bdf8] disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => void saveSharedNotes()}
                      disabled={!amInSelectedRoom || savingNotes}
                      className="mt-2 w-full rounded border border-[#2c3442] px-3 py-1.5 text-xs hover:border-[#38bdf8] disabled:opacity-60"
                    >
                      {savingNotes ? "Saving..." : "Save Notes"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-[#2b2f38] bg-[#11151c] p-6">
              <p className="text-sm text-gray-400">Create or select a room to start live discussion.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
