"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import Navbar from "@/components/navbar";
import { countWords, normalizeHandle, resolveAvatar } from "@/lib/profile";
import { LEVELS } from "@/lib/rewards";

type UserProfile = {
  nickname: string;
  handle: string;
  bio: string;
  hobbies: string;
  interests: string;
  skills: string[];
  avatarSeed: string;
  avatarUrl: string;
  publicProfile: boolean;
  linkedin: string;
  github: string;
  sapphires: number;
  level: number;
  levelTitle: string;
  postsCount: number;
  commentsCount: number;
  postStreak: number;
};

const defaultProfile: UserProfile = {
  nickname: "",
  handle: "",
  bio: "",
  hobbies: "",
  interests: "",
  skills: [],
  avatarSeed: "",
  avatarUrl: "",
  publicProfile: true,
  linkedin: "",
  github: "",
  sapphires: 0,
  level: 1,
  levelTitle: "Fresher",
  postsCount: 0,
  commentsCount: 0,
  postStreak: 0,
};

const BIO_WORD_LIMIT = 500;

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [skillsInput, setSkillsInput] = useState("");
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/");
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const snapshot = await getDoc(userRef);
      if (snapshot.exists()) {
        const data = snapshot.data() as Partial<UserProfile>;
        const nextProfile: UserProfile = {
          ...defaultProfile,
          ...data,
          nickname: data.nickname || user.displayName || "",
          handle: data.handle || normalizeHandle(data.nickname || user.displayName || ""),
          avatarSeed: data.avatarSeed || user.uid,
          avatarUrl: data.avatarUrl || user.photoURL || "",
          skills: Array.isArray(data.skills) ? data.skills : [],
        };
        setProfile(nextProfile);
        setSkillsInput(nextProfile.skills.join(", "));
      } else {
        const starter = {
          ...defaultProfile,
          nickname: user.displayName || "",
          handle: normalizeHandle(user.displayName || ""),
          avatarSeed: user.uid,
          avatarUrl: user.photoURL || "",
        };
        setProfile(starter);
        setSkillsInput("");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const avatarPreview = useMemo(() => resolveAvatar(profile, auth.currentUser?.uid), [profile]);
  const bioWordCount = useMemo(() => countWords(profile.bio), [profile.bio]);

  const updateField = <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const onAvatarFileChange = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarUploadError("Please upload an image file.");
      return;
    }
    if (file.size > 700 * 1024) {
      setAvatarUploadError("Image is too large. Use an image under 700KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setAvatarUploadError(null);
      setProfile((prev) => ({ ...prev, avatarUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const parsedSkills = skillsInput
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean)
      .slice(0, 10);

    if (!profile.nickname.trim()) {
      alert("Nickname is required.");
      return;
    }
    if (!profile.handle.trim()) {
      alert("Username handle is required.");
      return;
    }
    if (bioWordCount > BIO_WORD_LIMIT) {
      alert(`Bio must be ${BIO_WORD_LIMIT} words or fewer.`);
      return;
    }

    try {
      setSaving(true);
      await setDoc(
        doc(db, "users", user.uid),
        {
          ...profile,
          nickname: profile.nickname.trim(),
          handle: normalizeHandle(profile.handle),
          bio: profile.bio.trim(),
          hobbies: profile.hobbies.trim(),
          interests: profile.interests.trim(),
          avatarSeed: profile.avatarSeed.trim() || user.uid,
          avatarUrl: profile.avatarUrl.trim(),
          linkedin: profile.linkedin.trim(),
          github: profile.github.trim(),
          skills: parsedSkills,
          email: user.email ?? "",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setProfile((prev) => ({ ...prev, skills: parsedSkills }));
      setSkillsInput(parsedSkills.join(", "));
      alert("Profile saved.");
    } catch (error) {
      console.error(error);
      alert("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#0f0f0f] p-8 text-center text-gray-400">Loading profile...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4 rounded-2xl border border-[#2d2d2d] bg-[#141414] p-5">
          <h1 className="text-2xl font-bold text-[#ff8c42]">Profile Customization</h1>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-gray-400">Nickname</span>
              <input
                value={profile.nickname}
                onChange={(e) => {
                  const nextNickname = e.target.value;
                  updateField("nickname", nextNickname);
                  if (!profile.handle || profile.handle === normalizeHandle(profile.nickname)) {
                    updateField("handle", normalizeHandle(nextNickname));
                  }
                }}
                className="w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-gray-400">Username handle (@...)</span>
              <input
                value={profile.handle}
                onChange={(e) => updateField("handle", normalizeHandle(e.target.value))}
                className="w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
              />
            </label>
          </div>

          <label className="space-y-1">
            <span className="text-xs text-gray-400">Bio</span>
            <textarea
              value={profile.bio}
              onChange={(e) => updateField("bio", e.target.value)}
              className="min-h-24 w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
            />
            <p className={`text-xs ${bioWordCount > BIO_WORD_LIMIT ? "text-red-300" : "text-gray-500"}`}>
              {bioWordCount}/{BIO_WORD_LIMIT} words
            </p>
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-gray-400">Upload avatar image</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onAvatarFileChange(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-xs outline-none file:mr-2 file:rounded file:border-0 file:bg-[#ff6a00] file:px-2 file:py-1 file:text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-400">Avatar fallback seed</span>
              <input
                value={profile.avatarSeed}
                onChange={(e) => updateField("avatarSeed", e.target.value)}
                className="w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
              />
            </label>
          </div>
          {avatarUploadError ? <p className="text-xs text-red-300">{avatarUploadError}</p> : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-gray-400">Hobbies</span>
              <input
                value={profile.hobbies}
                onChange={(e) => updateField("hobbies", e.target.value)}
                className="w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-gray-400">Interests</span>
              <input
                value={profile.interests}
                onChange={(e) => updateField("interests", e.target.value)}
                className="w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
              />
            </label>
          </div>

          <label className="space-y-1">
            <span className="text-xs text-gray-400">Skills (comma-separated)</span>
            <input
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder="React, DSA, UI/UX"
              className="w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-gray-400">LinkedIn URL</span>
              <input
                value={profile.linkedin}
                onChange={(e) => updateField("linkedin", e.target.value)}
                className="w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-gray-400">GitHub URL</span>
              <input
                value={profile.github}
                onChange={(e) => updateField("github", e.target.value)}
                className="w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
              />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#2d2d2d] bg-[#111111] px-3 py-2">
            <p className="text-sm text-gray-300">Public profile visible in feed</p>
            <button
              onClick={() => updateField("publicProfile", !profile.publicProfile)}
              className={`h-6 w-11 rounded-full p-1 transition ${
                profile.publicProfile ? "bg-[#ff6a00]" : "bg-[#333333]"
              }`}
            >
              <span
                className={`block h-4 w-4 rounded-full bg-white transition ${
                  profile.publicProfile ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-xl bg-[#ff6a00] px-5 py-2 text-sm font-semibold text-white hover:bg-[#ff8c42] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </section>

        <aside className="space-y-3 rounded-2xl border border-[#2d2d2d] bg-[#141414] p-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Live Preview</p>
          <img src={avatarPreview} alt={profile.nickname || "Avatar"} className="h-20 w-20 rounded-full border border-[#ff8c42]" />
          <h3 className="text-xl font-semibold">{profile.nickname || "Campus User"}</h3>
          <p className="text-xs text-gray-400">@{profile.handle || "campus_user"}</p>
          <p className="text-xs text-[#5bc0ff]">Level: {profile.levelTitle || "Fresher"} | Sapphire: {profile.sapphires ?? 0}</p>
          <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{profile.bio || "Your bio will appear here."}</p>
          <div className="flex flex-wrap gap-2">
            {(skillsInput.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10)).map((skill) => (
              <span key={skill} className="rounded-md bg-[#2a1b12] px-2 py-1 text-xs text-[#ff8c42]">
                #{skill}
              </span>
            ))}
          </div>
          <div className="rounded-lg border border-[#2a2a2a] bg-[#101010] p-2">
            <p className="text-xs text-gray-400">Ranks</p>
            <div className="mt-1 space-y-1">
              {LEVELS.map((level) => (
                <p key={level.level} className="text-[11px] text-gray-300">
                  L{level.level} {level.title} - {level.minSapphires}+
                </p>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
