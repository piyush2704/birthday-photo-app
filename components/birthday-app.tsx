"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { demoEvent, demoGallery, demoProfile, demoQueue } from "../lib/mockData";
import { functionsBaseUrl, getSupabaseClient, hasSupabaseClientEnv } from "../lib/supabaseClient";
import type {
  EventMemberRecord,
  EventRecord,
  GuestUploadResponse,
  JoinEventResponse,
  PhotoCard,
  PhotoRecord,
  ProfileRecord,
} from "../lib/types";

type NoticeTone = "neutral" | "success" | "error";
type ModerationAction = "approve" | "reject";

type Notice = {
  message: string;
  tone: NoticeTone;
};

type JoinForm = {
  eventCode: string;
  pin: string;
};

type UploadForm = {
  eventCode: string;
  pin: string;
  uploaderName: string;
  file: File | null;
};

type ScreenKey = "home" | "auth" | "join" | "upload" | "gallery" | "admin" | "profile" | "photos-of-me";

type ScreenConfig = {
  key: ScreenKey;
  href: string;
  label: string;
};

type DashboardData = {
  event: EventRecord | null;
  member: EventMemberRecord | null;
  gallery: PhotoCard[];
  queue: PhotoCard[];
};

const screens: ScreenConfig[] = [
  { key: "home", href: "/", label: "Home" },
  { key: "auth", href: "/auth", label: "Sign in" },
  { key: "join", href: "/join", label: "Join event" },
  { key: "upload", href: "/upload", label: "Upload" },
  { key: "gallery", href: "/gallery", label: "Gallery" },
  { key: "admin", href: "/admin", label: "Moderation" },
  { key: "profile", href: "/profile", label: "Profile" },
  { key: "photos-of-me", href: "/photos-of-me", label: "Photos of me" },
];

const screenByPathname = new Map<string, ScreenKey>(screens.map((screen) => [screen.href, screen.key]));

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function buildPhotoCard(photo: PhotoRecord, imageUrl: string | null): PhotoCard {
  const uploader = photo.uploader_display_name || "Guest";

  return {
    id: photo.id,
    title: photo.caption || "Party photo",
    subtitle: `Uploaded by ${uploader} on ${formatDate(photo.created_at)}`,
    status: photo.status,
    imageUrl,
  };
}

async function createSignedViewUrls(paths: string[]) {
  if (paths.length === 0) {
    return new Map<string, string>();
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from("event-photos").createSignedUrls(paths, 3600);
  if (error || !data) {
    throw new Error(error?.message || "Failed to create signed image URLs.");
  }

  return new Map(data.map((entry) => [entry.path, entry.signedUrl]));
}

async function fetchDashboardData(eventId: string, userId: string): Promise<DashboardData> {
  const supabase = getSupabaseClient();

  const [{ data: eventData, error: eventError }, { data: memberData, error: memberError }] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, title, public_code, moderation_required, created_at")
        .eq("id", eventId)
        .maybeSingle(),
      supabase
        .from("event_members")
        .select("id, event_id, user_id, role, joined_at")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  if (eventError) {
    throw new Error(eventError.message);
  }

  if (memberError) {
    throw new Error(memberError.message);
  }

  const photoQuery = supabase
    .from("photos")
    .select("id, event_id, uploader_user_id, uploader_display_name, storage_path, caption, status, created_at")
    .eq("event_id", eventId)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  const pendingQuery = supabase
    .from("photos")
    .select("id, event_id, uploader_user_id, uploader_display_name, storage_path, caption, status, created_at")
    .eq("event_id", eventId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const hasAdminAccess = memberData?.role === "owner" || memberData?.role === "admin";
  const [photoResult, pendingResult] = await Promise.all([
    photoQuery,
    hasAdminAccess ? pendingQuery : Promise.resolve({ data: [], error: null }),
  ]);

  if (photoResult.error) {
    throw new Error(photoResult.error.message);
  }

  if (pendingResult.error) {
    throw new Error(pendingResult.error.message);
  }

  const approvedPhotos = photoResult.data || [];
  const pendingPhotos = pendingResult.data || [];
  const imageUrls = await createSignedViewUrls(
    [...approvedPhotos, ...pendingPhotos].map((item) => item.storage_path),
  );

  return {
    event: eventData,
    member: memberData,
    gallery: approvedPhotos.map((item) => buildPhotoCard(item, imageUrls.get(item.storage_path) ?? null)),
    queue: pendingPhotos.map((item) => buildPhotoCard(item, imageUrls.get(item.storage_path) ?? null)),
  };
}

function AppFrame({
  children,
  currentScreen,
  notice,
  activeEvent,
  signedInAs,
}: {
  children: ReactNode;
  currentScreen: ScreenKey;
  notice: Notice;
  activeEvent: string;
  signedInAs: string;
}) {
  return (
    <main className="page-shell app-shell">
      <section className="hero app-hero">
        <div className="hero-copy">
          <p className="eyebrow">Birthday Photo App</p>
          <h1>Fast party photo sharing, split into clear screens.</h1>
          <p className="hero-text">
            Guests upload in seconds. Members join with code and PIN. Hosts review pending photos
            without digging through one giant page.
          </p>
        </div>
        <div className="hero-panel">
          <div className="stat-row">
            <span className="stat-kicker">Current screen</span>
            <strong>{screens.find((screen) => screen.key === currentScreen)?.label || "Home"}</strong>
          </div>
          <div className="stat-row">
            <span className="stat-kicker">Active event</span>
            <strong>{activeEvent}</strong>
          </div>
          <div className="stat-row">
            <span className="stat-kicker">Signed in as</span>
            <strong>{signedInAs}</strong>
          </div>
          <p className={`notice notice-${notice.tone}`}>{notice.message}</p>
        </div>
      </section>

      <nav className="route-nav" aria-label="Primary">
        {screens.map((screen) => (
          <Link
            key={screen.key}
            className={`route-pill ${screen.key === currentScreen ? "route-pill-active" : ""}`}
            href={screen.href}
          >
            {screen.label}
          </Link>
        ))}
      </nav>

      {children}
    </main>
  );
}

function HomeScreen() {
  return (
    <section className="content-section route-section">
      <div className="section-heading">
        <div>
          <p className="section-label">Overview</p>
          <h2>Choose the screen that matches the job.</h2>
        </div>
      </div>
      <div className="route-grid">
        <Link className="card route-card" href="/auth">
          <p className="section-label">1</p>
          <h2>Sign in</h2>
          <p>Hosts and members authenticate here with email and password.</p>
        </Link>
        <Link className="card route-card" href="/join">
          <p className="section-label">2</p>
          <h2>Join event</h2>
          <p>Members unlock the gallery with an event code and PIN.</p>
        </Link>
        <Link className="card route-card" href="/upload">
          <p className="section-label">3</p>
          <h2>Guest upload</h2>
          <p>Party guests can upload without creating an account.</p>
        </Link>
        <Link className="card route-card" href="/gallery">
          <p className="section-label">4</p>
          <h2>Shared gallery</h2>
          <p>Members browse approved photos only.</p>
        </Link>
      </div>
    </section>
  );
}

export function BirthdayApp() {
  const pathname = usePathname();
  const router = useRouter();
  const currentScreen = screenByPathname.get(pathname) || "home";
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [joinForm, setJoinForm] = useState<JoinForm>({ eventCode: "", pin: "" });
  const [uploadForm, setUploadForm] = useState<UploadForm>({
    eventCode: "",
    pin: "",
    uploaderName: "",
    file: null,
  });
  const [notice, setNotice] = useState<Notice>({
    message: hasSupabaseClientEnv
      ? "Live client env detected. Auth, join-event, upload, and gallery reads are wired."
      : "Add public Supabase env vars to switch from demo mode to live mode.",
    tone: hasSupabaseClientEnv ? "success" : "error",
  });
  const [authBusy, setAuthBusy] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [moderationBusyId, setModerationBusyId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(hasSupabaseClientEnv ? null : demoProfile);
  const [event, setEvent] = useState<EventRecord | null>(hasSupabaseClientEnv ? null : demoEvent);
  const [member, setMember] = useState<EventMemberRecord | null>(null);
  const [gallery, setGallery] = useState<PhotoCard[]>(hasSupabaseClientEnv ? [] : demoGallery);
  const [queue, setQueue] = useState<PhotoCard[]>(hasSupabaseClientEnv ? [] : demoQueue);

  const isAdmin = member?.role === "owner" || member?.role === "admin";
  const welcomeLabel = useMemo(() => profile?.display_name || session?.user?.email || "Guest", [
    profile?.display_name,
    session?.user?.email,
  ]);

  useEffect(() => {
    if (!hasSupabaseClientEnv) {
      return;
    }

    let mounted = true;
    const supabase = getSupabaseClient();

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hasSupabaseClientEnv || !session?.user) {
      return;
    }

    void loadProfile(session.user.id);
  }, [session?.user]);

  async function loadProfile(userId: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, created_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      setNotice({ message: error.message, tone: "error" });
      return;
    }

    setProfile(data);
  }

  async function loadEventDashboard(eventId: string) {
    if (!session?.user) {
      return;
    }

    setDashboardBusy(true);

    try {
      const data = await fetchDashboardData(eventId, session.user.id);
      setEvent(data.event);
      setMember(data.member);
      setGallery(data.gallery);
      setQueue(data.queue);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load event dashboard.";
      setNotice({ message, tone: "error" });
    } finally {
      setDashboardBusy(false);
    }
  }

  async function handleSignUp() {
    if (!hasSupabaseClientEnv) {
      return;
    }

    setAuthBusy(true);
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });
    setAuthBusy(false);

    if (error) {
      setNotice({ message: error.message, tone: "error" });
      return;
    }

    setNotice({
      message: "Account created. Check your email if confirmation is enabled, then sign in.",
      tone: "success",
    });
    router.push("/join");
  }

  async function handleSignIn(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();

    if (!hasSupabaseClientEnv) {
      return;
    }

    setAuthBusy(true);
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);

    if (error) {
      setNotice({ message: error.message, tone: "error" });
      return;
    }

    setNotice({ message: "Signed in.", tone: "success" });
    router.push("/join");
  }

  async function handleSignOut() {
    if (!hasSupabaseClientEnv) {
      return;
    }

    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    setProfile(null);
    setEvent(null);
    setMember(null);
    setGallery([]);
    setQueue([]);
    setNotice({ message: "Signed out.", tone: "neutral" });
    router.push("/");
  }

  async function handleJoinEvent(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();

    if (!hasSupabaseClientEnv || !session?.access_token) {
      setNotice({ message: "Sign in before joining an event.", tone: "error" });
      return;
    }

    setJoinBusy(true);

    try {
      const response = await fetch(`${functionsBaseUrl}/join-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          event_code: joinForm.eventCode.trim(),
          pin: joinForm.pin.trim(),
        }),
      });

      const data = (await response.json()) as JoinEventResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to join event.");
      }

      await loadEventDashboard(data.event_id);
      setUploadForm((current) => ({
        ...current,
        eventCode: joinForm.eventCode,
        pin: joinForm.pin,
      }));
      setNotice({ message: "Joined event. Gallery unlocked.", tone: "success" });
      router.push("/gallery");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to join event.";
      setNotice({ message, tone: "error" });
    } finally {
      setJoinBusy(false);
    }
  }

  async function handleUpload(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();

    if (!hasSupabaseClientEnv || !uploadForm.file) {
      return;
    }

    const extension = uploadForm.file.name.split(".").pop()?.toLowerCase();
    if (!extension) {
      setNotice({ message: "Choose a JPG, PNG, HEIC, or WEBP image.", tone: "error" });
      return;
    }

    setUploadBusy(true);

    try {
      const supabase = getSupabaseClient();
      const response = await fetch(`${functionsBaseUrl}/guest-upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_code: uploadForm.eventCode.trim(),
          pin: uploadForm.pin.trim(),
          uploader_display_name: uploadForm.uploaderName.trim() || undefined,
          file_ext: extension,
        }),
      });

      const data = (await response.json()) as GuestUploadResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to prepare upload.");
      }

      const uploadResult = await supabase.storage
        .from("event-photos")
        .uploadToSignedUrl(data.storage_path, data.token, uploadForm.file);

      if (uploadResult.error) {
        throw new Error(uploadResult.error.message);
      }

      setUploadForm((current) => ({
        ...current,
        file: null,
      }));
      setNotice({
        message:
          data.status === "pending"
            ? "Photo uploaded. It is waiting for host approval."
            : "Photo uploaded and visible in the gallery.",
        tone: "success",
      });

      if (event?.id && session?.user) {
        await loadEventDashboard(event.id);
      }

      router.push("/gallery");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setNotice({ message, tone: "error" });
    } finally {
      setUploadBusy(false);
    }
  }

  function handleFileChange(eventFile: ChangeEvent<HTMLInputElement>) {
    const nextFile = eventFile.target.files?.[0] || null;
    setUploadForm((current) => ({ ...current, file: nextFile }));
  }

  async function handleModeration(photoId: string, action: ModerationAction) {
    if (!event?.id || !isAdmin) {
      return;
    }

    setModerationBusyId(photoId);

    try {
      const supabase = getSupabaseClient();
      const nextStatus = action === "approve" ? "approved" : "rejected";

      const { error: updateError } = await supabase.from("photos").update({ status: nextStatus }).eq("id", photoId);
      if (updateError) {
        throw new Error(updateError.message);
      }

      const { error: auditError } = await supabase.from("moderation_actions").insert({
        photo_id: photoId,
        action,
      });
      if (auditError) {
        throw new Error(auditError.message);
      }

      setNotice({
        message: action === "approve" ? "Photo approved and moved to the gallery." : "Photo rejected.",
        tone: "success",
      });
      await loadEventDashboard(event.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Moderation action failed.";
      setNotice({ message, tone: "error" });
    } finally {
      setModerationBusyId(null);
    }
  }

  const activeEventLabel = event?.title || "Join an event to unlock the dashboard";
  const signedInAs = session?.user?.email || "Anonymous guest";

  return (
    <AppFrame
      activeEvent={activeEventLabel}
      currentScreen={currentScreen}
      notice={notice}
      signedInAs={signedInAs}
    >
      {currentScreen === "home" ? <HomeScreen /> : null}

      {currentScreen === "auth" ? (
        <section className="content-section route-section">
          <article className="card">
            <div className="card-header">
              <div>
                <p className="section-label">Auth</p>
                <h2>Sign in or create your account</h2>
              </div>
              {session?.user ? (
                <button className="button button-secondary" onClick={handleSignOut} type="button">
                  Sign out
                </button>
              ) : null}
            </div>

            <form className="stack" onSubmit={handleSignIn}>
              <label className="field">
                <span>Full name</span>
                <input
                  onChange={(eventInput) => setFullName(eventInput.target.value)}
                  placeholder="Maya"
                  value={fullName}
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  onChange={(eventInput) => setEmail(eventInput.target.value)}
                  placeholder="maya@example.com"
                  type="email"
                  value={email}
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  onChange={(eventInput) => setPassword(eventInput.target.value)}
                  placeholder="At least 6 characters"
                  type="password"
                  value={password}
                />
              </label>
              <div className="button-row">
                <button className="button button-primary" disabled={authBusy || !hasSupabaseClientEnv}>
                  {authBusy ? "Working..." : "Sign in"}
                </button>
                <button
                  className="button button-secondary"
                  disabled={authBusy || !hasSupabaseClientEnv}
                  onClick={() => void handleSignUp()}
                  type="button"
                >
                  Create account
                </button>
              </div>
            </form>
          </article>
        </section>
      ) : null}

      {currentScreen === "join" ? (
        <section className="content-section route-section">
          <article className="card">
            <div className="card-header">
              <div>
                <p className="section-label">Member flow</p>
                <h2>Join with event code and PIN</h2>
              </div>
              <span className="pill">{session?.user ? "Signed in" : "Auth required"}</span>
            </div>

            <form className="stack" onSubmit={handleJoinEvent}>
              <label className="field">
                <span>Event code</span>
                <input
                  onChange={(eventInput) =>
                    setJoinForm((current) => ({ ...current, eventCode: eventInput.target.value.toUpperCase() }))
                  }
                  placeholder="AVA5"
                  value={joinForm.eventCode}
                />
              </label>
              <label className="field">
                <span>PIN</span>
                <input
                  onChange={(eventInput) =>
                    setJoinForm((current) => ({ ...current, pin: eventInput.target.value }))
                  }
                  placeholder="4 digit PIN"
                  value={joinForm.pin}
                />
              </label>
              <button className="button button-primary" disabled={joinBusy || !session?.user}>
                {joinBusy ? "Joining..." : "Join event"}
              </button>
            </form>
          </article>
        </section>
      ) : null}

      {currentScreen === "upload" ? (
        <section className="content-section route-section">
          <article className="card">
            <div className="card-header">
              <div>
                <p className="section-label">Guest upload</p>
                <h2>Upload without creating an account</h2>
              </div>
              <span className="pill">
                {event?.moderation_required ? "Host approval enabled" : "Auto-approve event"}
              </span>
            </div>

            <form className="stack" onSubmit={handleUpload}>
              <label className="field">
                <span>Event code</span>
                <input
                  onChange={(eventInput) =>
                    setUploadForm((current) => ({
                      ...current,
                      eventCode: eventInput.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="AVA5"
                  value={uploadForm.eventCode}
                />
              </label>
              <label className="field">
                <span>PIN</span>
                <input
                  onChange={(eventInput) =>
                    setUploadForm((current) => ({ ...current, pin: eventInput.target.value }))
                  }
                  placeholder="4 digit PIN"
                  value={uploadForm.pin}
                />
              </label>
              <label className="field">
                <span>Your name</span>
                <input
                  onChange={(eventInput) =>
                    setUploadForm((current) => ({ ...current, uploaderName: eventInput.target.value }))
                  }
                  placeholder="Optional"
                  value={uploadForm.uploaderName}
                />
              </label>
              <label className="field">
                <span>Photo</span>
                <input accept=".jpg,.jpeg,.png,.heic,.webp,image/*" onChange={handleFileChange} type="file" />
              </label>
              <button
                className="button button-primary"
                disabled={uploadBusy || !hasSupabaseClientEnv || !uploadForm.file}
              >
                {uploadBusy ? "Uploading..." : "Send photo"}
              </button>
            </form>
          </article>
        </section>
      ) : null}

      {currentScreen === "gallery" ? (
        <section className="content-section route-section">
          <div className="section-heading">
            <div>
              <p className="section-label">Shared gallery</p>
              <h2>Approved photos only</h2>
            </div>
            {event?.id && session?.user ? (
              <button
                className="button button-secondary"
                disabled={dashboardBusy}
                onClick={() => void loadEventDashboard(event.id)}
                type="button"
              >
                {dashboardBusy ? "Refreshing..." : "Refresh"}
              </button>
            ) : null}
          </div>

          {gallery.length === 0 ? (
            <div className="empty-state">
              <h3>No photos yet</h3>
              <p>Join an event to load the gallery, or upload the first image as a guest.</p>
            </div>
          ) : (
            <div className="photo-grid">
              {gallery.map((item) => (
                <article className="photo-card" key={item.id}>
                  <div className="photo-frame">
                    {item.imageUrl ? (
                      <Image alt={item.title} fill sizes="(max-width: 960px) 100vw, 33vw" src={item.imageUrl} unoptimized />
                    ) : (
                      <div className="photo-fallback" />
                    )}
                  </div>
                  <div className="photo-copy">
                    <div className="photo-copy-top">
                      <h3>{item.title}</h3>
                      <span className={`status status-${item.status}`}>{item.status}</span>
                    </div>
                    <p>{item.subtitle}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {currentScreen === "admin" ? (
        <section className="content-section route-section">
          <div className="section-heading">
            <div>
              <p className="section-label">Admin moderation</p>
              <h2>Pending review queue</h2>
            </div>
            <span className="pill">{isAdmin ? "Admin access" : "Read-only placeholder"}</span>
          </div>

          {!isAdmin && hasSupabaseClientEnv ? (
            <div className="empty-state">
              <h3>Admin view locked</h3>
              <p>Pending moderation loads only for members with owner or admin roles.</p>
            </div>
          ) : queue.length === 0 ? (
            <div className="empty-state">
              <h3>Queue is clear</h3>
              <p>No photos are waiting on approval right now.</p>
            </div>
          ) : (
            <div className="queue-list">
              {queue.map((item) => (
                <article className="queue-card" key={item.id}>
                  <div className="queue-preview">
                    {item.imageUrl ? (
                      <Image alt={item.title} fill sizes="(max-width: 640px) 100vw, 92px" src={item.imageUrl} unoptimized />
                    ) : null}
                  </div>
                  <div className="queue-copy">
                    <h3>{item.title}</h3>
                    <p>{item.subtitle}</p>
                  </div>
                  <div className="queue-actions">
                    <span className="status status-pending">pending</span>
                    <button
                      className="button button-secondary"
                      disabled={moderationBusyId === item.id}
                      onClick={() => void handleModeration(item.id, "approve")}
                      type="button"
                    >
                      {moderationBusyId === item.id ? "Working..." : "Approve"}
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={moderationBusyId === item.id}
                      onClick={() => void handleModeration(item.id, "reject")}
                      type="button"
                    >
                      {moderationBusyId === item.id ? "Working..." : "Reject"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {currentScreen === "profile" ? (
        <section className="content-section route-section">
          <article className="card">
            <div className="card-header">
              <div>
                <p className="section-label">Profile</p>
                <h2>{welcomeLabel}</h2>
              </div>
              <span className="pill">{member?.role || "guest-only"}</span>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Email</dt>
                <dd>{session?.user?.email || "Not signed in"}</dd>
              </div>
              <div>
                <dt>Joined event</dt>
                <dd>{event?.title || "No event joined yet"}</dd>
              </div>
              <div>
                <dt>My photos</dt>
                <dd>Photos-of-me matching is intentionally a placeholder in this phase.</dd>
              </div>
            </dl>
          </article>
        </section>
      ) : null}

      {currentScreen === "photos-of-me" ? (
        <section className="content-section placeholder-panel route-section">
          <p className="section-label">Photos of me</p>
          <h2>Placeholder only for this phase</h2>
          <p>
            The UX keeps this destination visible, but face matching is not implemented and the backend
            contract does not expose a search flow yet.
          </p>
        </section>
      ) : null}
    </AppFrame>
  );
}
