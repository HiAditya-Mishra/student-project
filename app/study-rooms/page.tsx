"use client";

import { FormEvent, useEffect, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import { addDoc, arrayUnion, collection, onSnapshot, serverTimestamp, updateDoc, doc } from "firebase/firestore";

type StudyRoom = {
  id: string;
  name?: string;
  topic?: string;
  hostName?: string;
  participants?: string[];
};

export default function StudyRoomsPage() {
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [roomName, setRoomName] = useState("");
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);

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
  }, []);

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
        hostName: user.displayName || "Host",
        participants: [user.uid],
        createdAt: serverTimestamp(),
      });
      setRoomName("");
      setTopic("");
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
      });
    } catch (error) {
      console.error(error);
      alert("Could not join room.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-3">
          <h1 className="text-2xl font-bold text-[#ff8c42]">Study Rooms</h1>
          <p className="text-sm text-gray-400">Real-time rooms for focused sessions and group prep.</p>

          {roomsError ? (
            <div className="rounded-xl border border-red-600/40 bg-red-950/30 p-3 text-sm text-red-200">
              {roomsError}
            </div>
          ) : null}

          <div className="space-y-3">
            {rooms.length ? (
              rooms.map((room) => (
                <div
                  key={room.id}
                  className="rounded-xl border border-[#2d2d2d] bg-[#141414] p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold">{room.name || "Untitled Room"}</p>
                      <p className="text-sm text-gray-400">{room.topic || "Open discussion"}</p>
                      <p className="mt-1 text-xs text-gray-500">Host: {room.hostName || "Unknown"}</p>
                    </div>
                    <button
                      onClick={() => void joinRoom(room.id)}
                      className="rounded-lg bg-[#ff6a00] px-3 py-1 text-sm font-semibold"
                    >
                      Join
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-gray-400">{room.participants?.length ?? 0} participants live</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-[#2d2d2d] bg-[#141414] p-4 text-sm text-gray-400">
                No study room is live right now.
              </div>
            )}
          </div>
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
