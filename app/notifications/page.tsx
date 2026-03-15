"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

type NotificationItem = {
  id: string;
  title?: string;
  body?: string;
  kind?: string;
  link?: string;
  createdAt?: { seconds?: number };
  read?: boolean;
};

function formatTime(seconds?: number) {
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function NotificationsPage() {
  const [uid, setUid] = useState<string>("");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || "");
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) {
      setItems([]);
      return;
    }

    const loadNotifications = async () => {
      try {
        const snapshot = await getDocs(query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc")));
        setError(null);
        setItems(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...(docSnapshot.data() as Omit<NotificationItem, "id">),
          })),
        );
      } catch (snapshotError) {
        console.error(snapshotError);
        setError("Notifications are blocked by Firestore rules.");
        setItems([]);
      }
    };

    void loadNotifications();
  }, [uid]);

  const grouped = useMemo(() => {
    const groups: Record<string, NotificationItem[]> = {};
    items.forEach((item) => {
      const key = item.kind || "Updates";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [items]);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-bold text-[#ff8c42]">Notification Centre</h1>
        <p className="mt-1 text-sm text-gray-400">
          Replies to doubts, sapphire earnings, new community activity, study invites, and collab responses.
        </p>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-600/40 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-6 text-sm text-gray-400">
              No notifications yet. Start a doubt thread or answer one to kick things off.
            </div>
          ) : (
            Object.entries(grouped).map(([kind, entries]) => (
              <section key={kind} className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
                <h2 className="text-sm font-semibold text-[#ff8c42]">{kind}</h2>
                <div className="mt-3 space-y-2">
                  {entries.map((item) => (
                    <div key={item.id} className="rounded-xl border border-[#2a2a2a] bg-[#101010] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-white">{item.title || "Update"}</p>
                          {item.body ? <p className="mt-1 text-xs text-gray-400">{item.body}</p> : null}
                        </div>
                        <span className="text-[11px] text-gray-500">{formatTime(item.createdAt?.seconds)}</span>
                      </div>
                      {item.link ? (
                        <p className="mt-2 text-[11px] text-[#ffb380]">{item.link}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
