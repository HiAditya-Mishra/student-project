"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar";
import { auth, db } from "@/lib/firebase";
import { addDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";

const AREAS = [
  "JEE Prep",
  "NEET Prep",
  "Board Exams",
  "College Academics",
  "Placements",
  "Career Guidance",
] as const;

type Offer = {
  id: string;
  name?: string;
  areas?: string[];
  experience?: string;
  availability?: string;
  bio?: string;
  authorId?: string;
  authorName?: string;
};

type Request = {
  id: string;
  name?: string;
  need?: string;
  area?: string;
  timeline?: string;
  authorId?: string;
  authorName?: string;
};

export default function MentorshipPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [offerName, setOfferName] = useState("");
  const [offerAreas, setOfferAreas] = useState<string[]>([]);
  const [offerExperience, setOfferExperience] = useState("");
  const [offerAvailability, setOfferAvailability] = useState("");
  const [offerBio, setOfferBio] = useState("");
  const [requestName, setRequestName] = useState("");
  const [requestNeed, setRequestNeed] = useState("");
  const [requestArea, setRequestArea] = useState(AREAS[0]);
  const [requestTimeline, setRequestTimeline] = useState("");
  const [postingOffer, setPostingOffer] = useState(false);
  const [postingRequest, setPostingRequest] = useState(false);
  const [filterArea, setFilterArea] = useState("All");

  useEffect(() => {
    const offerUnsub = onSnapshot(collection(db, "mentorshipOffers"), (snapshot) => {
      setOffers(
        snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Omit<Offer, "id">),
        })),
      );
    });

    const requestUnsub = onSnapshot(collection(db, "mentorshipRequests"), (snapshot) => {
      setRequests(
        snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...(docSnapshot.data() as Omit<Request, "id">),
        })),
      );
    });

    return () => {
      offerUnsub();
      requestUnsub();
    };
  }, []);

  const visibleOffers = useMemo(() => {
    if (filterArea === "All") return offers;
    return offers.filter((offer) => (offer.areas ?? []).includes(filterArea));
  }, [offers, filterArea]);

  const submitOffer = async (event: FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first.");
      return;
    }
    if (!offerName.trim() || offerAreas.length === 0) {
      alert("Name and at least one area are required.");
      return;
    }

    try {
      setPostingOffer(true);
      await addDoc(collection(db, "mentorshipOffers"), {
        name: offerName.trim(),
        areas: offerAreas,
        experience: offerExperience.trim(),
        availability: offerAvailability.trim(),
        bio: offerBio.trim(),
        authorId: user.uid,
        authorName: user.displayName || "Campus User",
        createdAt: serverTimestamp(),
      });
      setOfferName("");
      setOfferAreas([]);
      setOfferExperience("");
      setOfferAvailability("");
      setOfferBio("");
    } catch (error) {
      console.error(error);
      alert("Could not post mentorship offer.");
    } finally {
      setPostingOffer(false);
    }
  };

  const submitRequest = async (event: FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      alert("Please login first.");
      return;
    }
    if (!requestName.trim() || !requestNeed.trim()) {
      alert("Name and request details are required.");
      return;
    }

    try {
      setPostingRequest(true);
      await addDoc(collection(db, "mentorshipRequests"), {
        name: requestName.trim(),
        need: requestNeed.trim(),
        area: requestArea,
        timeline: requestTimeline.trim(),
        authorId: user.uid,
        authorName: user.displayName || "Campus User",
        createdAt: serverTimestamp(),
      });
      setRequestName("");
      setRequestNeed("");
      setRequestTimeline("");
      setRequestArea(AREAS[0]);
    } catch (error) {
      console.error(error);
      alert("Could not post mentorship request.");
    } finally {
      setPostingRequest(false);
    }
  };

  const toggleArea = (area: string) => {
    setOfferAreas((prev) => (prev.includes(area) ? prev.filter((item) => item !== area) : [...prev, area]));
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#ff8c42]">Senior-Junior Mentorship Matching</h1>
          <p className="text-sm text-gray-400">
            Final year students offer mentorship. Juniors request guidance on exams, prep strategy, and academics.
          </p>
        </div>

        <div className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400">Filter by area</span>
            <select
              value={filterArea}
              onChange={(event) => setFilterArea(event.target.value)}
              className="rounded-lg border border-[#2f2f2f] bg-[#0f0f0f] px-3 py-2 text-sm"
            >
              {(["All", ...AREAS] as const).map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[#ff8c42]">Available Mentors</h2>
            {visibleOffers.length ? (
              visibleOffers.map((offer) => (
                <div key={offer.id} className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
                  <p className="text-lg font-semibold text-white">{offer.name || "Mentor"}</p>
                  <p className="text-xs text-gray-500">Offered by {offer.authorName || "Campus User"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(offer.areas ?? []).map((area) => (
                      <span key={area} className="rounded-md bg-[#2a1b12] px-2 py-1 text-xs text-[#ff8c42]">
                        {area}
                      </span>
                    ))}
                  </div>
                  {offer.experience ? <p className="mt-2 text-sm text-gray-300">Experience: {offer.experience}</p> : null}
                  {offer.availability ? <p className="text-sm text-gray-300">Availability: {offer.availability}</p> : null}
                  {offer.bio ? <p className="mt-2 text-sm text-gray-400">{offer.bio}</p> : null}
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4 text-sm text-gray-500">
                No mentors listed yet.
              </p>
            )}
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
              <h3 className="text-sm font-semibold text-[#ff8c42]">Offer Mentorship</h3>
              <form onSubmit={submitOffer} className="mt-3 space-y-3">
                <input
                  value={offerName}
                  onChange={(event) => setOfferName(event.target.value)}
                  placeholder="Your name / title"
                  className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {AREAS.map((area) => (
                    <button
                      key={area}
                      type="button"
                      onClick={() => toggleArea(area)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        offerAreas.includes(area)
                          ? "border-[#ff6a00] bg-[#2a1608] text-[#ff8c42]"
                          : "border-[#2f2f2f] text-gray-300"
                      }`}
                    >
                      {area}
                    </button>
                  ))}
                </div>
                <input
                  value={offerExperience}
                  onChange={(event) => setOfferExperience(event.target.value)}
                  placeholder="Experience (e.g. AIR 1200, Topper, CR)"
                  className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
                />
                <input
                  value={offerAvailability}
                  onChange={(event) => setOfferAvailability(event.target.value)}
                  placeholder="Availability (weekends, evenings)"
                  className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
                />
                <textarea
                  value={offerBio}
                  onChange={(event) => setOfferBio(event.target.value)}
                  placeholder="Short bio or how you can help"
                  className="min-h-20 w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={postingOffer}
                  className="w-full rounded bg-[#ff6a00] px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {postingOffer ? "Posting..." : "List as Mentor"}
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
              <h3 className="text-sm font-semibold text-[#ff8c42]">Request a Mentor</h3>
              <form onSubmit={submitRequest} className="mt-3 space-y-3">
                <input
                  value={requestName}
                  onChange={(event) => setRequestName(event.target.value)}
                  placeholder="Your name"
                  className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
                />
                <select
                  value={requestArea}
                  onChange={(event) => setRequestArea(event.target.value)}
                  className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
                >
                  {AREAS.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
                <input
                  value={requestTimeline}
                  onChange={(event) => setRequestTimeline(event.target.value)}
                  placeholder="Timeline (e.g. 3 months)"
                  className="w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
                />
                <textarea
                  value={requestNeed}
                  onChange={(event) => setRequestNeed(event.target.value)}
                  placeholder="What kind of guidance do you need?"
                  className="min-h-20 w-full rounded border border-[#303030] bg-[#111111] px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={postingRequest}
                  className="w-full rounded bg-[#ff6a00] px-4 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  {postingRequest ? "Posting..." : "Request Mentor"}
                </button>
              </form>
            </div>
          </section>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[#ff8c42]">Mentorship Requests</h2>
          {requests.length ? (
            requests.map((request) => (
              <div key={request.id} className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
                <p className="text-lg font-semibold text-white">{request.name || "Student"}</p>
                <p className="text-xs text-gray-500">Requested by {request.authorName || "Campus User"}</p>
                <p className="mt-2 text-sm text-gray-300">Area: {request.area || "General"}</p>
                {request.timeline ? <p className="text-sm text-gray-400">Timeline: {request.timeline}</p> : null}
                {request.need ? <p className="mt-2 text-sm text-gray-400">{request.need}</p> : null}
              </div>
            ))
          ) : (
            <p className="rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4 text-sm text-gray-500">
              No mentorship requests yet.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
