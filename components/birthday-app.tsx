"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { demoEvent, demoGallery, demoProfile, demoQueue } from "../lib/mockData";
import {
  functionsBaseUrl,
  getSupabaseClient,
  hasSupabaseClientEnv,
} from "../lib/supabaseClient";
import type {
  CreateEventResponse,
  EventMemberRecord,
  EventRecord,
  GuestGalleryResponse,
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
  files: File[];
};

type HostForm = {
  title: string;
  publicCode: string;
  pin: string;
  moderationRequired: boolean;
};

type ScreenKey =
  | "home"
  | "auth"
  | "host"
  | "join"
  | "upload"
  | "gallery"
  | "event"
  | "admin"
  | "profile"
  | "photos-of-me";

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

type GuestAccess = {
  eventCode: string;
  pin: string;
};

type FilePreview = {
  id: string;
  url: string;
  name: string;
};

type BirthdayAppProps = {
  initialGuestAccess?: GuestAccess;
};

const messageIdeas = [
  "Share the photo that feels most like Vaayu's sunshine.",
  "Add your favorite candid moment from the celebration.",
  "Capture the little details the family will want to remember.",
];

const screens: ScreenConfig[] = [
  { key: "home", href: "/", label: "Home" },
  { key: "auth", href: "/auth", label: "Sign in" },
  { key: "host", href: "/host", label: "Host" },
  { key: "join", href: "/join", label: "Join event" },
  { key: "gallery", href: "/gallery", label: "Gallery" },
  { key: "upload", href: "/upload", label: "Upload" },
  { key: "event", href: "/event", label: "Event" },
  { key: "admin", href: "/admin", label: "Moderation" },
  { key: "profile", href: "/profile", label: "Profile" },
  { key: "photos-of-me", href: "/photos-of-me", label: "Vaayu" },
];

const screenByPathname = new Map<string, ScreenKey>(screens.map((screen) => [screen.href, screen.key]));
const storedEventIdKey = "birthday-photo-app.event-id";

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
  visibleScreens,
  compactGuestShell,
  openingPhotos,
  publicLanding,
}: {
  children: ReactNode;
  currentScreen: ScreenKey;
  notice: Notice;
  activeEvent: string;
  signedInAs: string;
  visibleScreens: ScreenConfig[];
  compactGuestShell: boolean;
  openingPhotos: string[];
  publicLanding: boolean;
}) {
  const collageSlots = openingPhotos.slice(0, 6);

  return (
    <main className="page-shell app-shell">
      {compactGuestShell && !publicLanding ? (
        <header className="guest-header">
          <Link className="guest-brand" href={visibleScreens[0]?.href || "/gallery"}>
            <span className="guest-brand-mark">✦</span>
            <span>
              <strong>Vaayu</strong>
              <small>1 Year Around the Sun</small>
            </span>
          </Link>
          <nav className="guest-header-nav" aria-label="Guest navigation">
            {visibleScreens.map((screen) => (
              <Link
                key={screen.key}
                className={`guest-header-link ${screen.key === currentScreen ? "guest-header-link-active" : ""}`}
                href={screen.href}
              >
                {screen.label}
              </Link>
            ))}
          </nav>
        </header>
      ) : null}

      <section
        className={`hero app-hero ${compactGuestShell ? "hero-public" : ""} ${publicLanding ? "hero-opening" : ""}`}
      >
        <div className="hero-copy">
          {publicLanding ? (
            <div className="hero-parallax" aria-hidden="true" />
          ) : null}
          {publicLanding ? (
            <>
              <div className="opening-collage" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((slot) => (
                  <div
                    className={`collage-tile ${
                      ["collage-tile-tall", "collage-tile-square", "collage-tile-wide", "collage-tile-small"][slot % 4]
                    }`}
                    key={slot}
                  >
                    {collageSlots[slot] ? (
                      <Image
                        alt=""
                        fill
                        sizes="160px"
                        src={collageSlots[slot]}
                        unoptimized
                      />
                    ) : (
                      <span className="collage-placeholder" />
                    )}
                  </div>
                ))}
              </div>
              <div className="hero-orbit">{"Vaayu's 1st Birthday"}</div>
              <p className="eyebrow">1 Year Around the Sun</p>
              <h1>Loading Vaayu&apos;s birthday memories.</h1>
              <p className="hero-text">
                A year of little moments led to this beautiful day. Step into Vaayu&apos;s gallery to see
                the celebration unfold.
              </p>
            </>
          ) : (
            <>
              <div className="hero-orbit">{"Vaayu's 1st Birthday"}</div>
              <p className="eyebrow">1 Year Around the Sun</p>
              <h1>Warm memories, little milestones, and one very special birthday.</h1>
              <p className="hero-text">
                Browse the family gallery first, then add the moments you captured from Vaayu&apos;s big
                day.
              </p>
            </>
          )}
        </div>
        {!compactGuestShell ? (
          <div className="hero-panel">
            <div className="sun-badge">Around the Sun</div>
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
        ) : null}
      </section>

      {!compactGuestShell ? (
        <nav className="route-nav route-nav-top" aria-label="Primary">
          {visibleScreens.map((screen) => (
            <Link
              key={screen.key}
              className={`route-pill ${screen.key === currentScreen ? "route-pill-active" : ""}`}
              href={screen.href}
            >
              {screen.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="screen-content">{children}</div>

      {!publicLanding ? (
        <nav
          className="bottom-nav"
          aria-label="Bottom navigation"
          style={{ gridTemplateColumns: `repeat(${visibleScreens.length}, minmax(0, 1fr))` }}
        >
          {visibleScreens.map((screen) => (
            <Link
              key={screen.key}
              className={`bottom-nav-link ${screen.key === currentScreen ? "bottom-nav-link-active" : ""}`}
              href={screen.href}
            >
              <span className="bottom-nav-dot" />
              {screen.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </main>
  );
}

function HomeScreen() {
  return (
    <section className="content-section route-section opening-note">
      <article className="card">
        <div className="memory-ribbon" aria-hidden="true">
          <span className="memory-dot" />
          <span className="memory-dot" />
          <span className="memory-dot" />
        </div>
        <p className="section-label">Opening Album</p>
        <h2>Gathering Vaayu&apos;s celebration in one place.</h2>
        <p className="inline-note">
          The app opens into the gallery first so family and guests see the memories before adding their
          own.
        </p>
      </article>
    </section>
  );
}

export function BirthdayApp({ initialGuestAccess }: BirthdayAppProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const currentScreen = screenByPathname.get(pathname) || "home";
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [joinForm, setJoinForm] = useState<JoinForm>({ eventCode: "", pin: "" });
  const [uploadForm, setUploadForm] = useState<UploadForm>({
    eventCode: initialGuestAccess?.eventCode || "",
    pin: initialGuestAccess?.pin || "",
    uploaderName: "",
    files: [],
  });
  const [hostForm, setHostForm] = useState<HostForm>({
    title: "",
    publicCode: "",
    pin: "",
    moderationRequired: true,
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
  const [hostBusy, setHostBusy] = useState(false);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [moderationBusyId, setModerationBusyId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(hasSupabaseClientEnv ? null : demoProfile);
  const [event, setEvent] = useState<EventRecord | null>(hasSupabaseClientEnv ? null : demoEvent);
  const [member, setMember] = useState<EventMemberRecord | null>(null);
  const [gallery, setGallery] = useState<PhotoCard[]>(hasSupabaseClientEnv ? [] : demoGallery);
  const [queue, setQueue] = useState<PhotoCard[]>(hasSupabaseClientEnv ? [] : demoQueue);
  const [guestAccess, setGuestAccess] = useState<GuestAccess>(
    initialGuestAccess || { eventCode: "", pin: "" },
  );
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([]);

  const isAdmin = member?.role === "owner" || member?.role === "admin";
  const isGuestFlow = !session?.user;
  const guestRestrictedScreen =
    isGuestFlow && ["auth", "host", "join", "admin", "profile", "photos-of-me"].includes(currentScreen);
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
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const nextEventCode = params.get("event");
    const nextPin = params.get("pin");

    if ((!nextEventCode && !nextPin) || initialGuestAccess) {
      return;
    }

    setUploadForm((current) => ({
      ...current,
      eventCode: nextEventCode ? nextEventCode.toUpperCase() : current.eventCode,
      pin: nextPin ?? current.pin,
    }));
    setGuestAccess({
      eventCode: nextEventCode ? nextEventCode.toUpperCase() : "",
      pin: nextPin ?? "",
    });
  }, [initialGuestAccess]);

  function buildGuestHref(path: string) {
    if (
      !isGuestFlow ||
      !guestAccess.eventCode ||
      !guestAccess.pin ||
      !["/", "/upload", "/gallery", "/event"].includes(path)
    ) {
      return path;
    }

    const params = new URLSearchParams({
      event: guestAccess.eventCode,
      pin: guestAccess.pin,
    });

    return `${path}?${params.toString()}`;
  }

  const guestUploadHref = buildGuestHref("/upload");
  const guestGalleryHref = buildGuestHref("/gallery");
  const visibleScreens = (
    isGuestFlow
      ? screens.filter((screen) => ["gallery", "upload"].includes(screen.key))
      : screens.filter((screen) => ["home", "upload", "gallery", "photos-of-me", "profile"].includes(screen.key))
  ).map((screen) => ({
    ...screen,
    href: buildGuestHref(screen.href),
  }));

  useEffect(() => {
    const nextPreviews = uploadForm.files.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      name: file.name,
      url: URL.createObjectURL(file),
    }));

    setFilePreviews(nextPreviews);

    return () => {
      nextPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [uploadForm.files]);

  useEffect(() => {
    if (!isGuestFlow || currentScreen !== "home") {
      return;
    }

    const timeout = window.setTimeout(() => {
      router.replace(guestGalleryHref);
    }, 1600);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [currentScreen, guestGalleryHref, isGuestFlow, router]);

  useEffect(() => {
    if (!hasSupabaseClientEnv || !session?.user) {
      return;
    }

    void loadProfile(session.user.id);
  }, [session?.user]);

  useEffect(() => {
    if (!hasSupabaseClientEnv || !session?.user || typeof window === "undefined") {
      return;
    }

    const storedEventId = window.localStorage.getItem(storedEventIdKey);
    if (!storedEventId || storedEventId === event?.id || dashboardBusy) {
      return;
    }

    let active = true;

    void (async () => {
      setDashboardBusy(true);

      try {
        const data = await fetchDashboardData(storedEventId, session.user.id);
        if (!active) {
          return;
        }
        setEvent(data.event);
        setMember(data.member);
        setGallery(data.gallery);
        setQueue(data.queue);
      } catch (error) {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : "Failed to restore event dashboard.";
        setNotice({ message, tone: "error" });
      } finally {
        if (active) {
          setDashboardBusy(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [dashboardBusy, event?.id, session?.user]);

  useEffect(() => {
    if (!hasSupabaseClientEnv || session?.user || !["home", "upload", "gallery", "event"].includes(currentScreen)) {
      return;
    }

    if (!guestAccess.eventCode || !guestAccess.pin) {
      return;
    }

    let active = true;
    setDashboardBusy(true);

    void (async () => {
      try {
        const response = await fetch(`${functionsBaseUrl}/guest-gallery`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event_code: guestAccess.eventCode,
            pin: guestAccess.pin,
          }),
        });

        const data = (await response.json()) as GuestGalleryResponse & { error?: string };
        if (!response.ok) {
          throw new Error(data.error || "Failed to load guest gallery.");
        }

        if (!active) {
          return;
        }

        setEvent(data.event);
        setGallery(
          data.photos.map((photo) => ({
            id: photo.id,
            title: photo.title,
            subtitle: photo.subtitle,
            status: photo.status,
            imageUrl: photo.image_url,
          })),
        );
        setQueue([]);
      } catch (error) {
        if (!active) {
          return;
        }
        setGallery([]);
        setEvent(null);
        const message = error instanceof Error ? error.message : "Failed to load guest gallery.";
        setNotice({ message, tone: "error" });
      } finally {
        if (active) {
          setDashboardBusy(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [currentScreen, guestAccess.eventCode, guestAccess.pin, session?.user]);

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
      if (typeof window !== "undefined" && data.event?.id) {
        window.localStorage.setItem(storedEventIdKey, data.event.id);
      }
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
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(storedEventIdKey);
    }
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
      setGuestAccess({ eventCode: joinForm.eventCode.trim().toUpperCase(), pin: joinForm.pin.trim() });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storedEventIdKey, data.event_id);
      }
      setNotice({ message: "Joined event. Gallery unlocked.", tone: "success" });
      router.push("/gallery");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to join event.";
      setNotice({ message, tone: "error" });
    } finally {
      setJoinBusy(false);
    }
  }

  async function handleCreateEvent(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();

    if (!hasSupabaseClientEnv || !session?.access_token) {
      setNotice({ message: "Sign in before creating an event.", tone: "error" });
      return;
    }

    setHostBusy(true);

    try {
      const response = await fetch(`${functionsBaseUrl}/create-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: hostForm.title.trim(),
          public_code: hostForm.publicCode.trim().toUpperCase(),
          pin: hostForm.pin.trim(),
          moderation_required: hostForm.moderationRequired,
        }),
      });

      const data = (await response.json()) as CreateEventResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to create event.");
      }

      await loadEventDashboard(data.event_id);
      setUploadForm((current) => ({
        ...current,
        eventCode: hostForm.publicCode.trim().toUpperCase(),
        pin: hostForm.pin.trim(),
      }));
      setGuestAccess({ eventCode: hostForm.publicCode.trim().toUpperCase(), pin: hostForm.pin.trim() });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storedEventIdKey, data.event_id);
      }
      setNotice({ message: "Event created. You are now the owner.", tone: "success" });
      router.push("/admin");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create event.";
      setNotice({ message, tone: "error" });
    } finally {
      setHostBusy(false);
    }
  }

  async function handleUpload(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();

    if (!hasSupabaseClientEnv || uploadForm.files.length === 0) {
      return;
    }

    setUploadBusy(true);

    try {
      const supabase = getSupabaseClient();
      let lastStatus: GuestUploadResponse["status"] = "approved";

      for (const file of uploadForm.files) {
        const extension = file.name.split(".").pop()?.toLowerCase();
        if (!extension) {
          throw new Error("Choose JPG, PNG, HEIC, or WEBP images only.");
        }

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
          .uploadToSignedUrl(data.storage_path, data.token, file);

        if (uploadResult.error) {
          throw new Error(uploadResult.error.message);
        }

        lastStatus = data.status;
      }

      setUploadForm((current) => ({
        ...current,
        files: [],
      }));
      setGuestAccess({
        eventCode: uploadForm.eventCode.trim().toUpperCase(),
        pin: uploadForm.pin.trim(),
      });
      setNotice({
        message:
          lastStatus === "pending"
            ? `${uploadForm.files.length} photo${uploadForm.files.length === 1 ? "" : "s"} uploaded. They are waiting for host approval.`
            : `${uploadForm.files.length} photo${uploadForm.files.length === 1 ? "" : "s"} uploaded and visible in the gallery.`,
        tone: "success",
      });

      if (event?.id && session?.user) {
        await loadEventDashboard(event.id);
      }

      router.push(buildGuestHref("/gallery"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setNotice({ message, tone: "error" });
    } finally {
      setUploadBusy(false);
    }
  }

  function handleFileChange(eventFile: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(eventFile.target.files || []);
    setUploadForm((current) => ({ ...current, files: nextFiles }));
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

  const activeEventLabel = event?.title || "Vaayu's 1st Birthday";
  const signedInAs = session?.user?.email || "Anonymous guest";
  const publicLanding = isGuestFlow && currentScreen === "home";
  const compactGuestShell = isGuestFlow && ["home", "upload", "gallery", "event"].includes(currentScreen);
  const openingPhotos = gallery.map((item) => item.imageUrl).filter((item): item is string => Boolean(item));
  const selectedPhoto = gallery.find((item) => item.id === selectedPhotoId) || null;

  return (
    <AppFrame
      activeEvent={activeEventLabel}
      compactGuestShell={compactGuestShell}
      currentScreen={currentScreen}
      notice={notice}
      openingPhotos={openingPhotos}
      publicLanding={publicLanding}
      signedInAs={signedInAs}
      visibleScreens={visibleScreens}
    >
      {currentScreen === "home" ? (
        <HomeScreen />
      ) : null}

      {guestRestrictedScreen ? (
        <section className="content-section route-section">
          <article className="card">
            <div className="card-header">
              <div>
                <p className="section-label">Guest Flow</p>
                <h2>Guests only need upload and gallery access.</h2>
              </div>
            </div>
            <p className="inline-note">
              Share memories from Vaayu&apos;s day or browse the approved gallery. Family-only tools stay
              out of the guest experience.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href={guestGalleryHref}>
                Open Gallery
              </Link>
              <Link className="button button-secondary" href={guestUploadHref}>
                Add Photos
              </Link>
            </div>
          </article>
        </section>
      ) : null}

      {currentScreen === "auth" && !guestRestrictedScreen ? (
        <section className="content-section route-section">
          <article className="card">
            <div className="card-header">
              <div>
                <p className="section-label">Family Access</p>
                <h2>{"Step into Vaayu's memory space."}</h2>
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
            <p className="inline-note">
              {"Parents, close family, and invited guests can sign in here to unlock Vaayu's shared"}
              {" memory feed."}
            </p>
          </article>
        </section>
      ) : null}

      {currentScreen === "host" && !guestRestrictedScreen ? (
        <section className="content-section route-section">
          <article className="card">
            <div className="card-header">
              <div>
                <p className="section-label">Host Setup</p>
                <h2>{"Create Vaayu's celebration space."}</h2>
              </div>
              <span className="pill">{session?.user ? "Ready" : "Sign in required"}</span>
            </div>

            <form className="stack" onSubmit={handleCreateEvent}>
              <label className="field">
                <span>Event title</span>
                <input
                  onChange={(eventInput) =>
                    setHostForm((current) => ({ ...current, title: eventInput.target.value }))
                  }
                  placeholder="Vaayu's 1 Year Around the Sun"
                  value={hostForm.title}
                />
              </label>
              <label className="field">
                <span>Event code</span>
                <input
                  onChange={(eventInput) =>
                    setHostForm((current) => ({
                      ...current,
                      publicCode: eventInput.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="AVA5"
                  value={hostForm.publicCode}
                />
              </label>
              <label className="field">
                <span>PIN</span>
                <input
                  onChange={(eventInput) =>
                    setHostForm((current) => ({ ...current, pin: eventInput.target.value }))
                  }
                  placeholder="4 to 8 digits"
                  value={hostForm.pin}
                />
              </label>
              <label className="toggle-field">
                <input
                  checked={hostForm.moderationRequired}
                  onChange={(eventInput) =>
                    setHostForm((current) => ({
                      ...current,
                      moderationRequired: eventInput.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                <span>Require host approval before photos appear in the gallery</span>
              </label>
              <button className="button button-primary" disabled={hostBusy || !session?.user}>
                {hostBusy ? "Creating..." : "Create event"}
              </button>
            </form>

            {!session?.user ? (
              <p className="inline-note">{"Sign in first, then come back here to create Vaayu's event."}</p>
            ) : event ? (
              <div className="host-summary">
                <p className="section-label">Current event</p>
                <h3>{event.title}</h3>
                <p>Code: {event.public_code}</p>
                <p>{event.moderation_required ? "Moderation is enabled." : "Uploads auto-approve."}</p>
              </div>
            ) : null}
          </article>
        </section>
      ) : null}

      {currentScreen === "join" && !guestRestrictedScreen ? (
        <section className="content-section route-section">
          <article className="card">
            <div className="card-header">
              <div>
                <p className="section-label">Join the Celebration</p>
                <h2>{"Enter Vaayu's event code and PIN to step into the memory feed."}</h2>
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
            {!session?.user ? (
              <p className="inline-note">
                {"You need an account before joining Vaayu's event. Use the sign-in screen first."}
              </p>
            ) : null}
          </article>
        </section>
      ) : null}

      {currentScreen === "upload" ? (
        <section className="content-section route-section upload-experience">
          <article className="card upload-card">
            <div className="upload-intro">
              <div>
                <p className="section-label">Upload</p>
                <h2>Share your favorite moments.</h2>
                <p className="inline-note">Help us celebrate Vaayu&apos;s journey around the sun.</p>
              </div>
              {!isGuestFlow ? (
                <span className="pill">
                  {event?.moderation_required ? "Host approval enabled" : "Auto-approve event"}
                </span>
              ) : null}
            </div>

            <form className="stack upload-form" onSubmit={handleUpload}>
              <div className="upload-fields">
                <label className="field">
                  <span>Event code</span>
                  <input
                    onChange={(eventInput) => {
                      const nextEventCode = eventInput.target.value.toUpperCase();
                      setUploadForm((current) => ({
                        ...current,
                        eventCode: nextEventCode,
                      }));
                      setGuestAccess((current) => ({ ...current, eventCode: nextEventCode }));
                    }}
                    placeholder="VAAYU"
                    value={uploadForm.eventCode}
                  />
                </label>
                <label className="field">
                  <span>PIN</span>
                  <input
                    onChange={(eventInput) => {
                      const nextPin = eventInput.target.value;
                      setUploadForm((current) => ({ ...current, pin: nextPin }));
                      setGuestAccess((current) => ({ ...current, pin: nextPin }));
                    }}
                    placeholder="2905"
                    value={uploadForm.pin}
                  />
                </label>
                <label className="field upload-field-wide">
                  <span>Your name</span>
                  <input
                    onChange={(eventInput) =>
                      setUploadForm((current) => ({ ...current, uploaderName: eventInput.target.value }))
                    }
                    placeholder="Optional"
                    value={uploadForm.uploaderName}
                  />
                </label>
              </div>

              <label className={`upload-zone ${filePreviews.length > 0 ? "upload-zone-filled" : ""}`}>
                <input
                  accept=".jpg,.jpeg,.png,.heic,.webp,image/*"
                  multiple
                  onChange={handleFileChange}
                  type="file"
                />
                <span className="upload-zone-icon">{filePreviews.length > 0 ? "🖼" : "↑"}</span>
                <strong>
                  {filePreviews.length > 0 ? "Add more sunshine memories" : "Share your favorite moments"}
                </strong>
                <span>
                  {filePreviews.length > 0
                    ? `${filePreviews.length} photo${filePreviews.length === 1 ? "" : "s"} ready to upload`
                    : "Drag, drop, or tap to choose photos from your phone"}
                </span>
                <small>JPG, PNG, HEIC, WEBP, multiple files</small>
              </label>

              {filePreviews.length > 0 ? (
                <div className="upload-preview-grid">
                  {filePreviews.map((preview) => (
                    <article className="upload-preview-card" key={preview.id}>
                      <Image
                        alt={preview.name}
                        height={320}
                        src={preview.url}
                        unoptimized
                        width={320}
                      />
                      <span>{preview.name}</span>
                    </article>
                  ))}
                </div>
              ) : null}

              <button
                className="button button-primary upload-cta"
                disabled={uploadBusy || !hasSupabaseClientEnv || uploadForm.files.length === 0}
              >
                {uploadBusy
                  ? "Uploading precious moments..."
                  : `Upload ${uploadForm.files.length || ""} ${
                      uploadForm.files.length === 1 ? "photo" : "photos"
                    } to Vaayu's album`.trim()}
              </button>
            </form>
            <p className="inline-note">
              {event?.moderation_required
                ? "Guests can upload one or many photos in seconds from their phones. The family will review them before they appear in Vaayu's gallery."
                : "Share the moments you captured from Vaayu's big day. Your photos appear in the gallery right away."}
            </p>
          </article>
        </section>
      ) : null}

      {currentScreen === "gallery" ? (
        <section className="content-section route-section gallery-experience">
          <div className="gallery-hero">
            <div>
              <p className="section-label">Gallery</p>
              <h2>A Year of Wonder</h2>
              <p className="gallery-subtitle">365 days of smiles, giggles, and sunshine ☀️</p>
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
              <h3>{"Vaayu's memory feed is waiting for its first photo."}</h3>
              <p>
                {session?.user
                  ? "Join the event to unlock the feed, or share the first memory as a guest."
                  : guestAccess.eventCode && guestAccess.pin
                    ? "Guests can browse the approved gallery for this celebration here."
                    : "Open the guest upload link with the event code and PIN to browse Vaayu's gallery."}
              </p>
            </div>
          ) : (
            <div className="gallery-masonry">
              {gallery.map((item) => (
                <article
                  className="gallery-masonry-item"
                  key={item.id}
                  onClick={() => setSelectedPhotoId(item.id)}
                >
                  <div className="photo-frame gallery-photo-frame">
                    {item.imageUrl ? (
                      <Image
                        alt={item.title}
                        fill
                        sizes="(max-width: 960px) 100vw, 33vw"
                        src={item.imageUrl}
                        unoptimized
                      />
                    ) : (
                      <div className="photo-fallback" />
                    )}
                    <div className="gallery-photo-overlay">
                      <p>
                        <span className="gallery-heart">♥</span>
                        {item.title}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="gallery-footer-note">
            <p>Every moment tells a story of love and light 💫</p>
          </div>

          {isGuestFlow ? (
            <Link className="floating-upload-cta" href={guestUploadHref}>
              <span className="floating-upload-plus">+</span>
              <span>Upload Photos</span>
            </Link>
          ) : null}

          {selectedPhoto ? (
            <button className="gallery-lightbox" onClick={() => setSelectedPhotoId(null)} type="button">
              <div className="gallery-lightbox-frame" onClick={(eventClick) => eventClick.stopPropagation()}>
                {selectedPhoto.imageUrl ? (
                  <Image
                    alt={selectedPhoto.title}
                    height={1080}
                    src={selectedPhoto.imageUrl}
                    unoptimized
                    width={1080}
                  />
                ) : (
                  <div className="photo-fallback" />
                )}
                <div className="gallery-lightbox-copy">
                  <h3>{selectedPhoto.title}</h3>
                  <p>{selectedPhoto.subtitle}</p>
                </div>
              </div>
            </button>
          ) : null}
        </section>
      ) : null}

      {currentScreen === "event" ? (
        <section className="content-section route-section">
          <article className="card placeholder-panel">
            <div className="card-header">
              <div>
                <p className="section-label">Event</p>
                <h2>Thanks for celebrating Vaayu.</h2>
              </div>
              <span className="pill">Family & friends</span>
            </div>
            <p className="inline-note">
              Your presence and photos mean so much to our family. This little gallery is our keepsake
              from Vaayu&apos;s first trip around the sun.
            </p>
            <dl className="detail-list">
              <div>
                <dt>Celebration</dt>
                <dd>Vaayu&apos;s 1st Birthday</dd>
              </div>
              <div>
                <dt>Theme</dt>
                <dd>1 Year Around the Sun</dd>
              </div>
              <div>
                <dt>Guest flow</dt>
                <dd>Browse the gallery first, then add your favorite moments from the day.</dd>
              </div>
            </dl>
            <div className="button-row">
              <Link className="button button-primary" href={guestGalleryHref}>
                Open Gallery
              </Link>
              <Link className="button button-secondary" href={guestUploadHref}>
                Add Photos
              </Link>
            </div>
          </article>
        </section>
      ) : null}

      {currentScreen === "admin" && !guestRestrictedScreen ? (
        <section className="content-section route-section">
          <div className="section-heading">
            <div>
              <p className="section-label">Host Review</p>
              <h2>{"Review memories before they appear in Vaayu's gallery."}</h2>
            </div>
            <span className="pill">{isAdmin ? "Admin access" : "Read-only placeholder"}</span>
          </div>

          {!session?.user ? (
            <div className="empty-state">
              <h3>Sign in required</h3>
              <p>Only signed-in hosts and admins can open the moderation queue.</p>
            </div>
          ) : !isAdmin && hasSupabaseClientEnv ? (
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

      {currentScreen === "profile" && !guestRestrictedScreen ? (
        <section className="content-section route-section">
          <article className="card">
            <div className="card-header">
              <div>
                <p className="section-label">Your Space</p>
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
                <dd>{"Your shared access to Vaayu's memory space will grow here over time."}</dd>
              </div>
            </dl>
            {!session?.user ? (
              <p className="inline-note">
                Sign in to see your real profile and any event membership tied to your account.
              </p>
            ) : null}
          </article>
        </section>
      ) : null}

      {currentScreen === "photos-of-me" && !guestRestrictedScreen ? (
        <section className="content-section placeholder-panel route-section">
          <p className="section-label">Vaayu Keepsakes</p>
          <h2>Photos of Vaayu, milestone moments, and messages are coming soon.</h2>
          <p>
            This space will grow into a keepsake corner for milestone moments, favorite portraits,
            {" and family notes saved for Vaayu's future memory book."}
          </p>
        </section>
      ) : null}
    </AppFrame>
  );
}
