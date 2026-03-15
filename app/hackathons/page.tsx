"use client";

import { FormEvent, useMemo, useState, useEffect } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";

const COMP_TYPES = ["Hackathon", "Case Competition", "College Fest", "Other"] as const;
const MODES = ["Online", "Onsite", "Hybrid"] as const;

type Listing = {
  id: string;
  title?: string;
  eventName?: string;
  type?: string;
  mode?: string;
  city?: string;
  teamSize?: string;
  skills?: string[];
  timeline?: string;
  description?: string;
  authorName?: string;
  createdAt?: { seconds?: number };
};

export default function HackathonTeamFinderPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [title, setTitle] = useState("");
  const [eventName, setEventName] = useState("");
  const [type, setType] = useState<(typeof COMP_TYPES)[number]>("Hackathon");
  const [mode, setMode] = useState<(typeof MODES)[number]>("Online");
  const [city, setCity] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [skills, setSkills] = useState("");
  const [timeline, setTimeline] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");

  useEffect(() => {
    const loadListings = async () => {
      const snapshot = await getDocs(collection(db, "teamFinderListings"));
      const nextListings: Listing[] = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...(docSnapshot.data() as Omit<Listing, "id">),
      }));
      setListings(nextListings);
    };

    void loadListings();
  }, []);

  const filteredListings = useMemo(() => {
    const token = query.trim().toLowerCase();
    return listings.filter((listing) => {
      if (typeFilter !== "All" && listing.type !== typeFilter) return false;
      if (!token) return true;
      const combined = [
        listing.title,
        listing.eventName,
        listing.type,
        listing.mode,
        listing.city,
        listing.teamSize,
        listing.timeline,
        listing.description,
        (listing.skills ?? []).join(" "),
        listing.authorName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return combined.includes(token);
    });
  }, [listings, query, typeFilter]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first.");
      return;
    }
    if (!title.trim() || !eventName.trim()) {
      alert("Post title and event name are required.");
      return;
    }

    try {
      setCreating(true);
      await addDoc(collection(db, "teamFinderListings"), {
        title: title.trim(),
        eventName: eventName.trim(),
        type,
        mode,
        city: city.trim(),
        teamSize: teamSize.trim(),
        skills: skills
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 12),
        timeline: timeline.trim(),
        description: description.trim(),
        authorId: user.uid,
        authorName: user.displayName || "Spheera User",
        createdAt: serverTimestamp(),
      });
      setTitle("");
      setEventName("");
      setType("Hackathon");
      setMode("Online");
      setCity("");
      setTeamSize("");
      setSkills("");
      setTimeline("");
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
      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-[#ff8c42]">Hackathon & Competition Team Finder</h1>
            <p className="text-sm text-gray-400">
              Post and discover teammates for hackathons, case competitions, and college fests.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#2d2d2d] bg-[#141414] p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by event, skills, city, or role"
              className="min-w-[240px] flex-1 rounded-lg border border-[#2f2f2f] bg-[#0f0f0f] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-[#2f2f2f] bg-[#0f0f0f] px-3 py-2 text-sm"
            >
              {["All", ...COMP_TYPES].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            {filteredListings.length ? (
              filteredListings.map((listing) => (
                <div key={listing.id} className="rounded-2xl border border-[#2d2d2d] bg-[#141414] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold text-white">{listing.title || "Looking for teammates"}</p>
                      <p className="text-sm text-gray-300">
                        {listing.eventName || "Unknown event"} · {listing.type || "Hackathon"}
                      </p>
                    </div>
                    <span className="rounded-full border border-[#2f2f2f] bg-[#101010] px-3 py-1 text-[11px] text-gray-300">
                      {listing.mode || "Online"}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
                    {listing.city ? <span>City: {listing.city}</span> : null}
                    {listing.teamSize ? <span>Team size: {listing.teamSize}</span> : null}
                    {listing.timeline ? <span>Timeline: {listing.timeline}</span> : null}
                  </div>

                  {listing.skills?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {listing.skills.map((skill) => (
                        <span key={skill} className="rounded-md bg-[#2a1b12] px-2 py-1 text-xs text-[#ff8c42]">
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {listing.description ? (
                    <p className="mt-3 text-sm text-gray-300">{listing.description}</p>
                  ) : null}

                  <p className="mt-3 text-xs text-gray-500">Posted by {listing.authorName || "Spheera User"}</p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-[#2d2d2d] bg-[#141414] p-4 text-sm text-gray-500">
                No team-finder listings yet.
              </p>
            )}
          </div>
        </section>

        <aside className="rounded-2xl border border-[#2d2d2d] bg-[#141414] p-4">
          <h2 className="text-lg font-semibold text-[#ff8c42]">Post Your Team Search</h2>
          <form onSubmit={submit} className="mt-3 space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Looking for teammates..."
              className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
            />
            <input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="Event (e.g. Smart India Hackathon)"
              className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as (typeof COMP_TYPES)[number])}
                className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
              >
                {COMP_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as (typeof MODES)[number])}
                className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
              >
                {MODES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City / College (optional)"
              className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
            />
            <input
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
              placeholder="Team size (e.g. 4-6, need 2 more)"
              className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
            />
            <input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="Skills needed (ML, backend, design)"
              className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
            />
            <input
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
              placeholder="Timeline / dates"
              className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your idea, expectations, and what you need"
              className="min-h-24 w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={creating}
              className="w-full rounded bg-[#ff6a00] px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {creating ? "Posting..." : "Post Team Search"}
            </button>
          </form>
        </aside>
      </main>
    </div>
  );
}

