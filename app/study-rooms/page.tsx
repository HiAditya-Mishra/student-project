"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
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

export default function StudyRoomsPage() {
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [roomName, setRoomName] = useState("");
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [creating, setCreating] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
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
        if (!selectedRoomId && nextRooms.length) {
          setSelectedRoomId(nextRooms[0].id);
        }
      },
      (error) => {
        console.error(error);
        setRoomsError(
          error.code === "permission-denied"
            ? "Study rooms are blocked by Firestore rules."
            : "Failed to load study rooms.",
        );
        setRooms([]);
      },
    );

    return () => unsubscribe();
  }, [selectedRoomId]);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

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

  const updateGoal = async () => {
    if (!selectedRoom) return;
    try {
      await updateDoc(doc(db, "studyRooms", selectedRoom.id), { goal: goal.trim() });
    } catch (error) {
      console.error(error);
      alert("Could not update room goal.");
    }
  };

  const startDraw = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#ff8c42";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(event.nativeEvent.offsetX, event.nativeEvent.offsetY);
  };

  const draw = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(event.nativeEvent.offsetX, event.nativeEvent.offsetY);
    ctx.stroke();
  };

  const stopDraw = () => {
    drawingRef.current = false;
  };

  const clearBoard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-3">
          <h1 className="text-2xl font-bold text-[#ff8c42]">Study Rooms</h1>
          <p className="text-sm text-gray-400">Pomodoro + whiteboard + goals + attendance log.</p>

          {roomsError ? (
            <div className="rounded-xl border border-red-600/40 bg-red-950/30 p-3 text-sm text-red-200">
              {roomsError}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {rooms.length ? (
              rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`rounded-xl border p-4 text-left ${
                    selectedRoomId === room.id
                      ? "border-[#ff6a00] bg-[#1b120d]"
                      : "border-[#2d2d2d] bg-[#141414]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold">{room.name || "Untitled Room"}</p>
                      <p className="text-sm text-gray-400">{room.topic || "Open discussion"}</p>
                      <p className="mt-1 text-xs text-gray-500">Goal: {room.goal || "No goal set"}</p>
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void joinRoom(room.id);
                      }}
                      className="rounded-lg bg-[#ff6a00] px-3 py-1 text-sm font-semibold"
                    >
                      Join
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-gray-400">{room.participants?.length ?? 0} participants live</p>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-[#2d2d2d] bg-[#141414] p-4 text-sm text-gray-400">
                No study room is live right now.
              </div>
            )}
          </div>

          {selectedRoom ? (
            <div className="grid gap-4 rounded-2xl border border-[#2d2d2d] bg-[#141414] p-4 lg:grid-cols-[1fr_280px]">
              <div className="space-y-3">
                <div className="rounded-xl border border-[#2f2f2f] bg-[#101010] p-3">
                  <p className="text-sm font-semibold text-[#ff8c42]">Shared Whiteboard</p>
                  <canvas
                    ref={canvasRef}
                    width={720}
                    height={260}
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={stopDraw}
                    onMouseLeave={stopDraw}
                    className="mt-2 w-full rounded-lg border border-[#2f2f2f] bg-[#0f0f0f]"
                  />
                  <button onClick={clearBoard} className="mt-2 rounded border border-[#2f2f2f] px-2 py-1 text-xs">
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-[#2f2f2f] bg-[#101010] p-3">
                  <p className="text-sm font-semibold text-[#ff8c42]">Pomodoro</p>
                  <p className="mt-2 text-3xl font-bold">{timer.label}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={timer.start} className="rounded bg-[#ff6a00] px-2 py-1 text-xs">Start</button>
                    <button onClick={timer.pause} className="rounded border border-[#2f2f2f] px-2 py-1 text-xs">Pause</button>
                    <button onClick={() => timer.reset(25)} className="rounded border border-[#2f2f2f] px-2 py-1 text-xs">Reset</button>
                  </div>
                </div>

                <div className="rounded-xl border border-[#2f2f2f] bg-[#101010] p-3">
                  <p className="text-sm font-semibold text-[#ff8c42]">Room Goal</p>
                  <input
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    placeholder={selectedRoom.goal || "Set today's goal"}
                    className="mt-2 w-full rounded border border-[#303030] bg-[#151515] px-2 py-1.5 text-xs"
                  />
                  <button onClick={() => void updateGoal()} className="mt-2 rounded bg-[#ff6a00] px-2 py-1 text-xs">
                    Save Goal
                  </button>
                </div>

                <div className="rounded-xl border border-[#2f2f2f] bg-[#101010] p-3">
                  <p className="text-sm font-semibold text-[#ff8c42]">Attendance Log</p>
                  <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                    {(selectedRoom.attendanceLog ?? []).length ? (
                      (selectedRoom.attendanceLog ?? []).map((entry) => (
                        <p key={entry} className="text-xs text-gray-300">{entry}</p>
                      ))
                    ) : (
                      <p className="text-xs text-gray-500">No attendance logs yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="rounded-2xl border border-[#2d2d2d] bg-[#141414] p-4">
          <h2 className="text-lg font-semibold text-[#ff8c42]">Create Room</h2>
          <form onSubmit={createRoom} className="mt-3 space-y-3">
            <input
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="Room name"
              className="w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
            />
            <textarea
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Topic or agenda"
              className="min-h-20 w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
            />
            <input
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Room goal"
              className="w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
            />
            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-lg bg-[#ff6a00] px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create Study Room"}
            </button>
          </form>
        </aside>
      </main>
    </div>
  );
}
