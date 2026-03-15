"use client";

import { FormEvent, useEffect, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

type Listing = {
  id: string;
  title?: string;
  role?: string;
  timeline?: string;
  skills?: string[];
  description?: string;
  authorId?: string;
  authorName?: string;
};

export default function CollabPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");
  const [timeline, setTimeline] = useState("");
  const [skills, setSkills] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [publicMode, setPublicMode] = useState(true);

  useEffect(() => {
    const loadListings = async () => {
      const snapshot = await getDocs(collection(db, "collabListings"));
      setListings(
        snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Omit<Listing, "id">),
        })),
      );
    };
    void loadListings();
  }, []);

  useEffect(() => {
    const authUnsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setCurrentUserId("");
        setPublicMode(true);
        return;
      }
      setCurrentUserId(user.uid);
      const loadProfile = async () => {
        const snapshot = await getDoc(doc(db, "users", user.uid));
        const data = snapshot.exists() ? snapshot.data() as { publicProfile?: boolean } : {};
        setPublicMode(data.publicProfile ?? true);
      };
      void loadProfile();
    });

    return () => {
      authUnsub();
    };
  }, []);

  const roomIdForPair = (a: string, b: string) => [a, b].sort().join("__");

  const handleRespond = async (listing: Listing) => {
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first.");
      return;
    }
    if (!publicMode) {
      alert("Messaging is disabled in incognito mode.");
      return;
    }
    if (!listing.authorId || listing.authorId === user.uid) return;

    try {
      const authorSnapshot = await getDoc(doc(db, "users", listing.authorId));
      const authorData = authorSnapshot.exists() ? authorSnapshot.data() as { publicProfile?: boolean } : {};
      if (authorData.publicProfile === false) {
        alert("This user is in incognito mode and cannot receive messages.");
        return;
      }

      const threadId = roomIdForPair(user.uid, listing.authorId);
      await setDoc(doc(db, "dmThreads", threadId), {
        participantIds: [user.uid, listing.authorId],
        requesterId: user.uid,
        recipientId: listing.authorId,
        status: "active",
        origin: "collab",
        collabListingId: listing.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: null,
      }, { merge: true });

      router.push(`/messages?thread=${threadId}`);
    } catch (error) {
      console.error(error);
      alert("Could not open a direct message.");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first.");
      return;
    }
    if (!title.trim() || !role.trim()) {
      alert("Title and role are required.");
      return;
    }

    try {
      setCreating(true);
      await addDoc(collection(db, "collabListings"), {
        title: title.trim(),
        role: role.trim(),
        timeline: timeline.trim(),
        skills: skills.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 10),
        description: description.trim(),
        authorId: user.uid,
        authorName: user.displayName || "Spheera User",
        createdAt: serverTimestamp(),
      });
      setTitle("");
      setRole("");
      setTimeline("");
      setSkills("");
      setDescription("");
    } catch (error) {
      console.error(error);
      alert("Could not create listing. Check Firestore rules.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-3">
          <h1 className="text-2xl font-bold text-[#ff8c42]">Collab Marketplace</h1>
          <p className="text-sm text-gray-400">Find teammates by role, skills, and timeline.</p>
          <div className="space-y-3">
            {listings.length ? (
              listings.map((listing) => (
                <div key={listing.id} className="rounded-xl border border-[#2d2d2d] bg-[#141414] p-4">
                  <p className="text-lg font-semibold">{listing.title || "Untitled Project"}</p>
                  <p className="text-sm text-gray-300">Role: {listing.role || "-"}</p>
                  <p className="text-sm text-gray-300">Timeline: {listing.timeline || "-"}</p>
                  <p className="mt-2 text-xs text-gray-500">By {listing.authorName || "Spheera User"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(listing.skills ?? []).map((skill) => (
                      <span key={skill} className="rounded bg-[#2a1b12] px-2 py-1 text-xs text-[#ff8c42]">
                        {skill}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-sm text-gray-300">{listing.description || ""}</p>
                  {currentUserId && listing.authorId && listing.authorId !== currentUserId ? (
                    <button
                      type="button"
                      onClick={() => void handleRespond(listing)}
                      className="mt-3 rounded-lg border border-[#ff6a00] px-3 py-1 text-xs font-semibold text-[#ff8c42] hover:bg-[#1f120a]"
                    >
                      Respond in DM
                    </button>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-[#2d2d2d] bg-[#141414] p-4 text-sm text-gray-500">
                No collab listings yet.
              </p>
            )}
          </div>
        </section>

        <aside className="rounded-2xl border border-[#2d2d2d] bg-[#141414] p-4">
          <h2 className="text-lg font-semibold text-[#ff8c42]">Create Listing</h2>
          <form onSubmit={submit} className="mt-3 space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title" className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm" />
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Needed role (Frontend, UI/UX...)" className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm" />
            <input value={timeline} onChange={(e) => setTimeline(e.target.value)} placeholder="Timeline (2 weeks, 1 month...)" className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm" />
            <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Skills (comma separated)" className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="min-h-24 w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm" />
            <button type="submit" disabled={creating} className="w-full rounded bg-[#ff6a00] px-4 py-2 text-sm font-semibold disabled:opacity-60">
              {creating ? "Posting..." : "Post Listing"}
            </button>
          </form>
        </aside>
      </main>
    </div>
  );
}

