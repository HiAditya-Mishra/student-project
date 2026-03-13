"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import Navbar from "@/components/navbar";
import { avatarFromSeed, normalizeHandle, resolveAvatar } from "@/lib/profile";
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

const BIO_CHAR_LIMIT = 1000;
const AVATAR_CROP_SIZE = 260;

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [skillsInput, setSkillsInput] = useState("");
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [pendingAvatarSrc, setPendingAvatarSrc] = useState<string | null>(null);
  const [pendingAvatarMeta, setPendingAvatarMeta] = useState<{ width: number; height: number } | null>(null);
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarPanX, setAvatarPanX] = useState(0);
  const [avatarPanY, setAvatarPanY] = useState(0);
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
  const bioCharCount = profile.bio.length;
  const seedAvatarPreview = useMemo(
    () => avatarFromSeed(profile.avatarSeed.trim() || auth.currentUser?.uid || "spheera-user"),
    [profile.avatarSeed],
  );
  const hasCustomAvatar = Boolean(profile.avatarUrl.trim());

  const updateField = <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const getCropLayout = () => {
    if (!pendingAvatarMeta) return null;
    const coverScale = Math.max(AVATAR_CROP_SIZE / pendingAvatarMeta.width, AVATAR_CROP_SIZE / pendingAvatarMeta.height);
    const drawWidth = pendingAvatarMeta.width * coverScale * avatarZoom;
    const drawHeight = pendingAvatarMeta.height * coverScale * avatarZoom;
    const drawX = (AVATAR_CROP_SIZE - drawWidth) / 2 + avatarPanX;
    const drawY = (AVATAR_CROP_SIZE - drawHeight) / 2 + avatarPanY;
    return { drawWidth, drawHeight, drawX, drawY };
  };

  const applyAvatarCrop = async () => {
    if (!pendingAvatarSrc || !pendingAvatarMeta) return;
    const layout = getCropLayout();
    if (!layout) return;

    const source = new Image();
    source.src = pendingAvatarSrc;
    await new Promise<void>((resolve, reject) => {
      source.onload = () => resolve();
      source.onerror = () => reject(new Error("Could not load image"));
    });

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ratio = canvas.width / AVATAR_CROP_SIZE;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
      source,
      layout.drawX * ratio,
      layout.drawY * ratio,
      layout.drawWidth * ratio,
      layout.drawHeight * ratio,
    );
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/png", 0.92);
    setProfile((prev) => ({ ...prev, avatarUrl: dataUrl }));
    setPendingAvatarSrc(null);
    setPendingAvatarMeta(null);
    setAvatarZoom(1);
    setAvatarPanX(0);
    setAvatarPanY(0);
  };

  const resetAvatarToSeed = () => {
    setProfile((prev) => ({ ...prev, avatarUrl: "" }));
    setAvatarUploadError(null);
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
      const img = new Image();
      img.onload = () => {
        setAvatarUploadError(null);
        setPendingAvatarSrc(reader.result as string);
        setPendingAvatarMeta({ width: img.naturalWidth, height: img.naturalHeight });
        setAvatarZoom(1);
        setAvatarPanX(0);
        setAvatarPanY(0);
      };
      img.onerror = () => setAvatarUploadError("Could not load this image.");
      img.src = reader.result as string;
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
    const normalizedHandle = normalizeHandle(profile.handle);
    if (!normalizedHandle.trim()) {
      alert("Username handle is required.");
      return;
    }
    if (bioCharCount > BIO_CHAR_LIMIT) {
      alert(`Bio must be ${BIO_CHAR_LIMIT} characters or fewer.`);
      return;
    }

    try {
      setSaving(true);
      const handleQuery = query(collection(db, "users"), where("handle", "==", normalizedHandle));
      const handleMatches = await getDocs(handleQuery);
      const isTaken = handleMatches.docs.some((match) => match.id !== user.uid);
      if (isTaken) {
        alert("This @username is already taken. Please choose another one.");
        setSaving(false);
        return;
      }

      await setDoc(
        doc(db, "users", user.uid),
        {
          ...profile,
          nickname: profile.nickname.trim(),
          handle: normalizedHandle,
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
              maxLength={BIO_CHAR_LIMIT}
              className="min-h-24 w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
            />
            <p className={`text-xs ${bioCharCount > BIO_CHAR_LIMIT ? "text-red-300" : "text-gray-500"}`}>
              {bioCharCount}/{BIO_CHAR_LIMIT} characters
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetAvatarToSeed}
                  className="rounded-md border border-[#2f2f2f] px-2 py-1 text-[11px] text-gray-300 hover:border-[#ff6a00]"
                >
                  Reset to Seed Avatar
                </button>
                {hasCustomAvatar ? <span className="text-[11px] text-[#ffb380]">Custom avatar active</span> : null}
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-400">Avatar fallback seed</span>
              <input
                value={profile.avatarSeed}
                onChange={(e) => updateField("avatarSeed", e.target.value)}
                className="w-full rounded-lg border border-[#303030] bg-[#111111] px-3 py-2 text-sm outline-none focus:border-[#ff6a00]"
              />
              <img
                src={seedAvatarPreview}
                alt="Seed avatar preview"
                className={`h-10 w-10 rounded-full border border-[#2f2f2f] transition-opacity ${hasCustomAvatar ? "opacity-40" : "opacity-100"}`}
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
          <h3 className="text-xl font-semibold">{profile.nickname || "Spheera User"}</h3>
          <p className="text-xs text-gray-400">@{profile.handle || "spheera_user"}</p>
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

      {pendingAvatarSrc && pendingAvatarMeta ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md space-y-3 rounded-2xl border border-[#2f2f2f] bg-[#141414] p-4">
            <p className="text-sm font-semibold text-[#ff8c42]">Crop Avatar</p>
            <p className="text-xs text-gray-400">Adjust and save only circular avatar image.</p>

            <div className="mx-auto relative overflow-hidden rounded-full border border-[#ff8c42]" style={{ width: AVATAR_CROP_SIZE, height: AVATAR_CROP_SIZE }}>
              {(() => {
                const layout = getCropLayout();
                if (!layout) return null;
                return (
                  <img
                    src={pendingAvatarSrc}
                    alt="Avatar crop preview"
                    className="absolute max-w-none"
                    style={{
                      width: layout.drawWidth,
                      height: layout.drawHeight,
                      left: layout.drawX,
                      top: layout.drawY,
                    }}
                  />
                );
              })()}
            </div>

            <label className="space-y-1 block">
              <span className="text-xs text-gray-400">Zoom</span>
              <input
                type="range"
                min={1}
                max={2.5}
                step={0.01}
                value={avatarZoom}
                onChange={(e) => setAvatarZoom(Number(e.target.value))}
                className="w-full"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-gray-400">Horizontal</span>
                <input
                  type="range"
                  min={-120}
                  max={120}
                  step={1}
                  value={avatarPanX}
                  onChange={(e) => setAvatarPanX(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-gray-400">Vertical</span>
                <input
                  type="range"
                  min={-120}
                  max={120}
                  step={1}
                  value={avatarPanY}
                  onChange={(e) => setAvatarPanY(Number(e.target.value))}
                  className="w-full"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingAvatarSrc(null);
                  setPendingAvatarMeta(null);
                }}
                className="rounded-lg border border-[#2f2f2f] px-3 py-1.5 text-xs text-gray-300 hover:border-[#ff6a00]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void applyAvatarCrop()}
                className="rounded-lg bg-[#ff6a00] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Apply Crop
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}



