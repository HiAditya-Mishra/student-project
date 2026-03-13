"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { rewardStudyPomodoroComplete } from "@/lib/rewards";

type ParticipantMeta = {
  name?: string;
  goal?: string;
  joinedAt?: { seconds?: number } | null;
};

type PomodoroState = {
  focusMinutes?: number;
  breakMinutes?: number;
  mode?: "focus" | "break";
  running?: boolean;
  startedAt?: { seconds?: number } | null;
  remainingSeconds?: number | null;
  cycleCount?: number;
  lastCycleEndedAt?: { seconds?: number } | null;
};

type StudyRoom = {
  id: string;
  name?: string;
  topic?: string;
  goal?: string;
  hostName?: string;
  participants?: string[];
  participantMeta?: Record<string, ParticipantMeta>;
  attendanceLog?: string[];
  sharedNotes?: string;
  tags?: string[];
  pomodoro?: PomodoroState;
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

type SessionLog = {
  id: string;
  text?: string;
  userId?: string;
  userName?: string;
  cycleId?: string;
  cycleCount?: number;
  createdAt?: { seconds?: number };
};

const SUBJECT_TAGS = [
  "JEE",
  "NEET",
  "GATE",
  "DSA",
  "Web Dev",
  "DBMS",
  "CN",
  "OS",
  "CAT Prep",
  "Board Exams",
  "Aptitude",
  "Maths",
  "Physics",
  "Chemistry",
  "Biology",
  "Placement Prep",
];

function formatMessageTime(seconds?: number) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTimestamp(seconds?: number) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatTimer(secondsLeft: number) {
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function StudyRoomsPage() {
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [roomName, setRoomName] = useState("");
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [roomTags, setRoomTags] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");

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

  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [logDraft, setLogDraft] = useState("");
  const [savingLog, setSavingLog] = useState(false);
  const [showLogPrompt, setShowLogPrompt] = useState(false);
  const [lastPromptedCycle, setLastPromptedCycle] = useState<number>(0);

  const [showChat, setShowChat] = useState(false);
  const [showResources, setShowResources] = useState(false);

  const [showGoalPrompt, setShowGoalPrompt] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);

  const [now, setNow] = useState(() => Date.now());
  const completingCycleRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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

  const filteredRooms = useMemo(() => {
    if (!tagFilter) return rooms;
    return rooms.filter((room) => (room.tags || []).includes(tagFilter));
  }, [rooms, tagFilter]);

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
    if (!selectedRoomId) {
      setSessionLogs([]);
      return;
    }

    const unsubscribe = onSnapshot(
      query(collection(db, "studyRooms", selectedRoomId, "sessionLogs"), orderBy("createdAt", "desc")),
      (snapshot) => {
        setSessionLogs(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...(docSnapshot.data() as Omit<SessionLog, "id">),
          })),
        );
      },
      (error) => {
        console.error(error);
        setSessionLogs([]);
      },
    );

    return () => unsubscribe();
  }, [selectedRoomId]);

  useEffect(() => {
    setSharedNotes(selectedRoom?.sharedNotes || "");
  }, [selectedRoom?.id, selectedRoom?.sharedNotes]);

  const amInSelectedRoom = Boolean(
    auth.currentUser?.uid &&
      selectedRoom?.participants?.includes(auth.currentUser.uid),
  );

  const myMeta = useMemo(() => {
    if (!auth.currentUser?.uid) return null;
    return selectedRoom?.participantMeta?.[auth.currentUser.uid] ?? null;
  }, [selectedRoom?.participantMeta, auth.currentUser?.uid]);

  useEffect(() => {
    if (!amInSelectedRoom) {
      setShowGoalPrompt(false);
      return;
    }
    if (!myMeta?.goal) {
      setGoalDraft("");
      setShowGoalPrompt(true);
    }
  }, [amInSelectedRoom, myMeta?.goal]);

  const pomodoro = selectedRoom?.pomodoro;
  const focusMinutes = pomodoro?.focusMinutes ?? 25;
  const breakMinutes = pomodoro?.breakMinutes ?? 5;
  const mode = pomodoro?.mode ?? "focus";
  const baseRemaining = pomodoro?.remainingSeconds ?? (mode === "focus" ? focusMinutes : breakMinutes) * 60;
  const nowSeconds = Math.floor(now / 1000);
  const remainingSeconds = !pomodoro?.running || !pomodoro?.startedAt?.seconds
    ? Math.max(0, baseRemaining)
    : Math.max(0, baseRemaining - (nowSeconds - pomodoro.startedAt.seconds));
  const timerLabel = formatTimer(remainingSeconds);
  const cycleCount = pomodoro?.cycleCount ?? 0;
  const focusElapsedSeconds = mode === "focus"
    ? Math.max(0, focusMinutes * 60 - remainingSeconds)
    : focusMinutes * 60;
  const focusElapsedMinutes = Math.floor(focusElapsedSeconds / 60);

  const currentCycleId = selectedRoomId ? `${selectedRoomId}:${cycleCount}` : "";
  const hasLoggedThisCycle = Boolean(
    auth.currentUser?.uid &&
      sessionLogs.some(
        (log) => log.cycleId === currentCycleId && log.userId === auth.currentUser?.uid,
      ),
  );

  useEffect(() => {
    if (!selectedRoomId || !amInSelectedRoom) return;
    if (mode === "break" && cycleCount > 0 && cycleCount !== lastPromptedCycle && !hasLoggedThisCycle) {
      setShowLogPrompt(true);
      setLastPromptedCycle(cycleCount);
    }
  }, [selectedRoomId, mode, cycleCount, lastPromptedCycle, amInSelectedRoom, hasLoggedThisCycle]);

  useEffect(() => {
    if (!selectedRoomId || !pomodoro?.running) return;
    if (remainingSeconds > 0) return;
    if (completingCycleRef.current) return;
    completingCycleRef.current = true;

    const completeCycle = async () => {
      const roomRef = doc(db, "studyRooms", selectedRoomId);
      await runTransaction(db, async (tx) => {
        const snapshot = await tx.get(roomRef);
        if (!snapshot.exists()) return;
        const data = snapshot.data() as StudyRoom;
        const currentPomodoro = data.pomodoro;
        if (!currentPomodoro?.running || !currentPomodoro.startedAt?.seconds) return;

        const currentMode = currentPomodoro.mode ?? "focus";
        const currentFocus = currentPomodoro.focusMinutes ?? 25;
        const currentBreak = currentPomodoro.breakMinutes ?? 5;
        const currentBaseRemaining = currentPomodoro.remainingSeconds ?? (currentMode === "focus" ? currentFocus : currentBreak) * 60;
        const elapsed = Math.floor(Date.now() / 1000) - currentPomodoro.startedAt.seconds;
        if (elapsed < currentBaseRemaining) return;

        const nextMode = currentMode === "focus" ? "break" : "focus";
        const nextDuration = nextMode === "focus" ? currentFocus : currentBreak;
        const nextCycle = (currentPomodoro.cycleCount ?? 0) + (currentMode === "focus" ? 1 : 0);

        tx.update(roomRef, {
          "pomodoro.running": false,
          "pomodoro.mode": nextMode,
          "pomodoro.startedAt": null,
          "pomodoro.remainingSeconds": nextDuration * 60,
          "pomodoro.cycleCount": nextCycle,
          "pomodoro.lastCycleEndedAt": serverTimestamp(),
        });
      });
    };

    void completeCycle().finally(() => {
      completingCycleRef.current = false;
    });
  }, [selectedRoomId, pomodoro?.running, remainingSeconds]);

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
    if (!roomTags.length) {
      alert("Please pick at least one subject tag.");
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
        participantMeta: {
          [user.uid]: {
            name: user.displayName || "Spheera User",
            goal: "",
            joinedAt: serverTimestamp(),
          },
        },
        attendanceLog: [`${new Date().toLocaleString()} - ${user.displayName || "User"} joined`],
        sharedNotes: "",
        tags: roomTags,
        pomodoro: {
          focusMinutes: 25,
          breakMinutes: 5,
          mode: "focus",
          running: false,
          startedAt: null,
          remainingSeconds: 25 * 60,
          cycleCount: 0,
        },
        createdAt: serverTimestamp(),
      });
      setRoomName("");
      setTopic("");
      setGoal("");
      setRoomTags([]);
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

    const targetRoom = rooms.find((room) => room.id === roomId);
    const updates: Record<string, unknown> = {
      participants: arrayUnion(user.uid),
      attendanceLog: arrayUnion(`${new Date().toLocaleString()} - ${user.displayName || "User"} joined`),
      [`participantMeta.${user.uid}`]: {
        name: user.displayName || "Spheera User",
        goal: targetRoom?.participantMeta?.[user.uid]?.goal || "",
        joinedAt: serverTimestamp(),
      },
    };

    if (!targetRoom?.pomodoro) {
      updates.pomodoro = {
        focusMinutes: 25,
        breakMinutes: 5,
        mode: "focus",
        running: false,
        startedAt: null,
        remainingSeconds: 25 * 60,
        cycleCount: 0,
      };
    }

    try {
      await updateDoc(doc(db, "studyRooms", roomId), updates);
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
        [`participantMeta.${user.uid}`]: deleteField(),
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
        senderName: user.displayName || "Spheera User",
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
        sharedByName: user.displayName || "Spheera User",
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

  const saveGoal = async () => {
    const user = auth.currentUser;
    if (!user || !selectedRoomId) return;
    if (!goalDraft.trim()) return;

    try {
      setSavingGoal(true);
      await updateDoc(doc(db, "studyRooms", selectedRoomId), {
        [`participantMeta.${user.uid}.goal`]: goalDraft.trim(),
      });
      setShowGoalPrompt(false);
      setGoalDraft("");
    } catch (error) {
      console.error(error);
      alert("Could not save your goal.");
    } finally {
      setSavingGoal(false);
    }
  };

  const startPomodoro = async () => {
    if (!selectedRoom || !amInSelectedRoom) return;
    const currentPomodoro = selectedRoom.pomodoro;
    const duration = currentPomodoro?.mode === "break" ? breakMinutes : focusMinutes;
    const remaining = currentPomodoro?.remainingSeconds ?? duration * 60;

    try {
      await updateDoc(doc(db, "studyRooms", selectedRoom.id), {
        "pomodoro.running": true,
        "pomodoro.startedAt": serverTimestamp(),
        "pomodoro.remainingSeconds": remaining,
      });
    } catch (error) {
      console.error(error);
      alert("Could not start the timer.");
    }
  };

  const pausePomodoro = async () => {
    if (!selectedRoom || !amInSelectedRoom) return;

    try {
      await updateDoc(doc(db, "studyRooms", selectedRoom.id), {
        "pomodoro.running": false,
        "pomodoro.startedAt": null,
        "pomodoro.remainingSeconds": remainingSeconds,
      });
    } catch (error) {
      console.error(error);
      alert("Could not pause the timer.");
    }
  };

  const resetPomodoro = async () => {
    if (!selectedRoom || !amInSelectedRoom) return;

    try {
      await updateDoc(doc(db, "studyRooms", selectedRoom.id), {
        "pomodoro.running": false,
        "pomodoro.mode": "focus",
        "pomodoro.startedAt": null,
        "pomodoro.remainingSeconds": focusMinutes * 60,
      });
    } catch (error) {
      console.error(error);
      alert("Could not reset the timer.");
    }
  };

  const setPreset = async (nextFocus: number, nextBreak: number) => {
    if (!selectedRoom || !amInSelectedRoom) return;

    try {
      await updateDoc(doc(db, "studyRooms", selectedRoom.id), {
        "pomodoro.focusMinutes": nextFocus,
        "pomodoro.breakMinutes": nextBreak,
        "pomodoro.mode": "focus",
        "pomodoro.running": false,
        "pomodoro.startedAt": null,
        "pomodoro.remainingSeconds": nextFocus * 60,
      });
    } catch (error) {
      console.error(error);
      alert("Could not update timer preset.");
    }
  };

  const submitSessionLog = async () => {
    const user = auth.currentUser;
    if (!user || !selectedRoomId) return;
    if (!logDraft.trim()) return;

    try {
      setSavingLog(true);
      await addDoc(collection(db, "studyRooms", selectedRoomId, "sessionLogs"), {
        text: logDraft.trim(),
        userId: user.uid,
        userName: user.displayName || "Spheera User",
        cycleId: currentCycleId,
        cycleCount,
        createdAt: serverTimestamp(),
      });
      await rewardStudyPomodoroComplete(user.uid);
      setLogDraft("");
      setShowLogPrompt(false);
    } catch (error) {
      console.error(error);
      alert("Could not save your update.");
    } finally {
      setSavingLog(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0d11] text-white">
      <Navbar />
      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4 rounded-2xl border border-[#2b2f38] bg-[#11151c] p-4">
          <div>
            <h2 className="text-lg font-semibold text-[#fdba74]">Live Study Rooms</h2>
            <p className="mt-1 text-xs text-gray-400">Quiet accountability spaces. Pick a subject and start the session.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTagFilter("")}
              className={`rounded-full border px-3 py-1 text-[11px] ${tagFilter ? "border-[#2c3442] text-gray-400" : "border-[#f97316] text-[#f97316]"}`}
            >
              All Subjects
            </button>
            {SUBJECT_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter(tag)}
                className={`rounded-full border px-3 py-1 text-[11px] ${tagFilter === tag ? "border-[#f97316] text-[#f97316]" : "border-[#2c3442] text-gray-400"}`}
              >
                {tag}
              </button>
            ))}
          </div>

          {roomsError ? (
            <div className="rounded-xl border border-red-600/40 bg-red-950/30 p-3 text-xs text-red-200">
              {roomsError}
            </div>
          ) : null}

          <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            {filteredRooms.length ? (
              filteredRooms.map((room) => (
                <div
                  key={room.id}
                  className={`rounded-xl border p-3 ${
                    selectedRoomId === room.id
                      ? "border-[#fb923c] bg-[#191e27]"
                      : "border-[#2c3442] bg-[#0d1218]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedRoomId(room.id)}
                    className="w-full text-left"
                  >
                    <p className="text-sm font-semibold">{room.name || "Untitled Room"}</p>
                    <p className="mt-1 text-xs text-gray-400">{room.topic || "Focused study"}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(room.tags || []).map((tag) => (
                        <span key={tag} className="rounded-full border border-[#2c3442] px-2 py-0.5 text-[10px] text-gray-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[11px] text-gray-500">{room.participants?.length ?? 0} live</p>
                    <button
                      type="button"
                      onClick={() => void joinRoom(room.id)}
                      className="rounded-md bg-[#f97316] px-2 py-1 text-[11px] font-semibold text-[#1a0d05]"
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
            <p className="text-sm font-semibold text-[#fdba74]">Create Room</p>
            <input
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="Room name"
              className="w-full rounded-lg border border-[#2c3442] bg-[#0a1016] px-3 py-2 text-sm outline-none focus:border-[#fb923c]"
            />
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Topic summary"
              className="w-full rounded-lg border border-[#2c3442] bg-[#0a1016] px-3 py-2 text-sm outline-none focus:border-[#fb923c]"
            />
            <input
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Room goal (optional)"
              className="w-full rounded-lg border border-[#2c3442] bg-[#0a1016] px-3 py-2 text-sm outline-none focus:border-[#fb923c]"
            />
            <div className="space-y-1">
              <p className="text-xs text-gray-400">Subject tags (required)</p>
              <div className="flex flex-wrap gap-2">
                {SUBJECT_TAGS.map((tag) => {
                  const active = roomTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setRoomTags((prev) =>
                          prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-[11px] ${
                        active ? "border-[#f97316] text-[#f97316]" : "border-[#2c3442] text-gray-400"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-lg bg-[#f97316] px-3 py-2 text-sm font-semibold text-[#1a0d05] disabled:opacity-60"
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
                    <h1 className="text-2xl font-bold text-[#fdba74]">{selectedRoom.name || "Untitled Room"}</h1>
                    <p className="mt-1 text-sm text-gray-300">{selectedRoom.topic || "Silent accountability"}</p>
                    <p className="mt-1 text-xs text-gray-500">Room goal: {selectedRoom.goal || "Set your intent and lock in."}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(selectedRoom.tags || []).map((tag) => (
                        <span key={tag} className="rounded-full border border-[#2c3442] px-2 py-0.5 text-[10px] text-gray-300">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {amInSelectedRoom ? (
                      <button
                        type="button"
                        onClick={() => void leaveRoom(selectedRoom.id)}
                        className="rounded-lg border border-[#2c3442] px-3 py-1.5 text-xs hover:border-[#fb923c]"
                      >
                        Leave Room
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void joinRoom(selectedRoom.id)}
                        className="rounded-lg bg-[#f97316] px-3 py-1.5 text-xs font-semibold text-[#1a0d05]"
                      >
                        Join to Participate
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="space-y-4">
                  <div className="rounded-3xl border border-[#2b2f38] bg-[#11151c] p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Room Pomodoro</p>
                        <p className="mt-2 text-[72px] font-bold leading-none text-[#fff4e6]">{timerLabel}</p>
                        <p className="mt-2 text-sm text-gray-400">
                          {mode === "focus" ? "Focus cycle" : "Break cycle"} · {focusMinutes}-{breakMinutes}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <button
                          onClick={startPomodoro}
                          disabled={!amInSelectedRoom}
                          className="w-full rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-[#1a0d05] disabled:opacity-50"
                        >
                          Start
                        </button>
                        <button
                          onClick={pausePomodoro}
                          disabled={!amInSelectedRoom}
                          className="w-full rounded-lg border border-[#2c3442] px-4 py-2 text-sm text-gray-200 hover:border-[#fb923c] disabled:opacity-50"
                        >
                          Pause
                        </button>
                        <button
                          onClick={resetPomodoro}
                          disabled={!amInSelectedRoom}
                          className="w-full rounded-lg border border-[#2c3442] px-4 py-2 text-sm text-gray-200 hover:border-[#fb923c] disabled:opacity-50"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void setPreset(25, 5)}
                        disabled={!amInSelectedRoom}
                        className={`rounded-full border px-4 py-1 text-xs ${
                          focusMinutes === 25 && breakMinutes === 5
                            ? "border-[#f97316] text-[#f97316]"
                            : "border-[#2c3442] text-gray-400"
                        }`}
                      >
                        25-5 Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => void setPreset(50, 10)}
                        disabled={!amInSelectedRoom}
                        className={`rounded-full border px-4 py-1 text-xs ${
                          focusMinutes === 50 && breakMinutes === 10
                            ? "border-[#f97316] text-[#f97316]"
                            : "border-[#2c3442] text-gray-400"
                        }`}
                      >
                        50-10 Deep Prep
                      </button>
                    </div>
                    <p className="mt-4 text-xs text-gray-500">Synced for the whole room. Start and pause together.</p>
                  </div>

                  <div className="rounded-2xl border border-[#2b2f38] bg-[#11151c]">
                    <button
                      type="button"
                      onClick={() => setShowChat((prev) => !prev)}
                      className="flex w-full items-center justify-between border-b border-[#242a33] px-4 py-3 text-left"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#fdba74]">Room Chat</p>
                        <p className="text-xs text-gray-500">Open only when you want discussion.</p>
                      </div>
                      <span className="text-xs text-gray-400">{showChat ? "Hide" : "Open"}</span>
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-300 ${
                        showChat ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0"
                      }`}
                    >
                      <div className="max-h-[360px] space-y-2 overflow-y-auto bg-[#0b1118] p-3">
                        {messages.length ? (
                          messages.map((message) => {
                            const mine = message.senderId === auth.currentUser?.uid;
                            return (
                              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${mine ? "bg-[#9a3412]" : "bg-[#1b2531]"}`}>
                                  {!mine ? (
                                    <p className="mb-0.5 text-[11px] text-[#fdba74]">{message.senderName || "Spheera User"}</p>
                                  ) : null}
                                  <p className="whitespace-pre-wrap break-words">{message.text || ""}</p>
                                  <p className="mt-1 text-[10px] text-gray-300">{formatMessageTime(message.createdAt?.seconds)}</p>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-sm text-gray-500">No chat yet. Stay focused.</p>
                        )}
                      </div>
                      <form onSubmit={sendMessage} className="border-t border-[#242a33] p-3">
                        <div className="flex gap-2">
                          <input
                            value={messageDraft}
                            onChange={(event) => setMessageDraft(event.target.value)}
                            placeholder={amInSelectedRoom ? "Discuss with your room..." : "Join room to chat"}
                            disabled={!amInSelectedRoom}
                            className="flex-1 rounded-lg border border-[#2c3442] bg-[#0c1218] px-3 py-2 text-sm outline-none focus:border-[#fb923c] disabled:opacity-50"
                          />
                          <button
                            type="submit"
                            disabled={!amInSelectedRoom || sendingMessage}
                            className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-[#1a0d05] disabled:opacity-60"
                          >
                            {sendingMessage ? "Sending..." : "Send"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#2b2f38] bg-[#11151c]">
                    <button
                      type="button"
                      onClick={() => setShowResources((prev) => !prev)}
                      className="flex w-full items-center justify-between border-b border-[#242a33] px-4 py-3 text-left"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#fdba74]">Shared Resources</p>
                        <p className="text-xs text-gray-500">Slide open only when you need material.</p>
                      </div>
                      <span className="text-xs text-gray-400">{showResources ? "Hide" : "Open"}</span>
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-300 ${
                        showResources ? "max-h-[680px] opacity-100" : "max-h-0 opacity-0"
                      }`}
                    >
                      <div className="p-4">
                        <form onSubmit={shareResource} className="grid gap-2 md:grid-cols-2">
                          <input
                            value={resourceTitle}
                            onChange={(event) => setResourceTitle(event.target.value)}
                            placeholder="Resource title"
                            disabled={!amInSelectedRoom}
                            className="rounded-lg border border-[#2c3442] bg-[#0c1218] px-3 py-2 text-sm outline-none focus:border-[#fb923c] disabled:opacity-50"
                          />
                          <input
                            value={resourceUrl}
                            onChange={(event) => setResourceUrl(event.target.value)}
                            placeholder="https://... (optional)"
                            disabled={!amInSelectedRoom}
                            className="rounded-lg border border-[#2c3442] bg-[#0c1218] px-3 py-2 text-sm outline-none focus:border-[#fb923c] disabled:opacity-50"
                          />
                          <input
                            value={resourceDescription}
                            onChange={(event) => setResourceDescription(event.target.value)}
                            placeholder="Quick note"
                            disabled={!amInSelectedRoom}
                            className="md:col-span-2 rounded-lg border border-[#2c3442] bg-[#0c1218] px-3 py-2 text-sm outline-none focus:border-[#fb923c] disabled:opacity-50"
                          />
                          <button
                            type="submit"
                            disabled={!amInSelectedRoom || sharingResource}
                            className="md:col-span-2 rounded-lg border border-[#2c3442] px-3 py-2 text-sm font-semibold hover:border-[#fb923c] disabled:opacity-60"
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
                                    className="mt-1 block break-all text-xs text-[#fdba74] hover:underline"
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
                  </div>

                  <div className="rounded-2xl border border-[#2b2f38] bg-[#11151c] p-4">
                    <p className="text-sm font-semibold text-[#fdba74]">Session Log</p>
                    <p className="mt-1 text-xs text-gray-500">Room history of what got done this cycle.</p>
                    <div className="mt-3 space-y-2">
                      {sessionLogs.length ? (
                        sessionLogs.map((log) => (
                          <div key={log.id} className="rounded-xl border border-[#2c3442] bg-[#0c1218] p-3">
                            <div className="flex items-center justify-between text-[11px] text-gray-500">
                              <span>{log.userName || "Member"}</span>
                              <span>{formatTimestamp(log.createdAt?.seconds)}</span>
                            </div>
                            <p className="mt-1 text-sm text-gray-200">{log.text || ""}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">No updates yet. First Pomodoro will start the log.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#2b2f38] bg-[#11151c] p-4">
                    <p className="text-sm font-semibold text-[#fdba74]">Participants</p>
                    <p className="mt-1 text-xs text-gray-500">{selectedRoom.participants?.length ?? 0} users in room</p>
                    <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto">
                      {Object.entries(selectedRoom.participantMeta || {}).length ? (
                        Object.entries(selectedRoom.participantMeta || {}).map(([uid, meta]) => (
                          <div key={uid} className="rounded-xl border border-[#2c3442] bg-[#0c1218] p-3">
                            <p className="text-sm text-gray-200">
                              {meta.name || "Member"} · {meta.goal || "Set a goal"} · {focusElapsedMinutes} min
                            </p>
                            <p className="mt-1 text-[11px] text-gray-500">Presence: focused</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500">No presence data yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#2b2f38] bg-[#11151c] p-4">
                    <p className="text-sm font-semibold text-[#fdba74]">Shared Notes</p>
                    <textarea
                      value={sharedNotes}
                      onChange={(event) => setSharedNotes(event.target.value)}
                      disabled={!amInSelectedRoom}
                      placeholder="Write collaborative notes for this room..."
                      className="mt-2 min-h-28 w-full rounded-lg border border-[#2c3442] bg-[#0c1218] px-3 py-2 text-sm outline-none focus:border-[#fb923c] disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => void saveSharedNotes()}
                      disabled={!amInSelectedRoom || savingNotes}
                      className="mt-2 w-full rounded border border-[#2c3442] px-3 py-1.5 text-xs hover:border-[#fb923c] disabled:opacity-60"
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

      {showGoalPrompt && amInSelectedRoom ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[#2b2f38] bg-[#11151c] p-5">
            <p className="text-sm font-semibold text-[#fdba74]">Set your session goal</p>
            <p className="mt-1 text-xs text-gray-500">What are you working on right now?</p>
            <input
              value={goalDraft}
              onChange={(event) => setGoalDraft(event.target.value)}
              placeholder="Finishing Chapter 4 of OS"
              className="mt-3 w-full rounded-lg border border-[#2c3442] bg-[#0c1218] px-3 py-2 text-sm outline-none focus:border-[#fb923c]"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={saveGoal}
                disabled={savingGoal || !goalDraft.trim()}
                className="flex-1 rounded-lg bg-[#f97316] px-3 py-2 text-sm font-semibold text-[#1a0d05] disabled:opacity-60"
              >
                {savingGoal ? "Saving..." : "Lock Goal"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showLogPrompt && amInSelectedRoom && !hasLoggedThisCycle ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[#2b2f38] bg-[#11151c] p-5">
            <p className="text-sm font-semibold text-[#fdba74]">What did you get done?</p>
            <p className="mt-1 text-xs text-gray-500">Your update will appear in the shared session log.</p>
            <textarea
              value={logDraft}
              onChange={(event) => setLogDraft(event.target.value)}
              placeholder="Finished two DBMS lectures and solved 5 queries"
              className="mt-3 min-h-24 w-full rounded-lg border border-[#2c3442] bg-[#0c1218] px-3 py-2 text-sm outline-none focus:border-[#fb923c]"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={submitSessionLog}
                disabled={savingLog || !logDraft.trim()}
                className="flex-1 rounded-lg bg-[#f97316] px-3 py-2 text-sm font-semibold text-[#1a0d05] disabled:opacity-60"
              >
                {savingLog ? "Saving..." : "Save update"}
              </button>
              <button
                type="button"
                onClick={() => setShowLogPrompt(false)}
                className="rounded-lg border border-[#2c3442] px-3 py-2 text-sm text-gray-300 hover:border-[#fb923c]"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

