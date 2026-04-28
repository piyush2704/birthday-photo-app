"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  functionsBaseUrl,
  getSupabaseClient,
  hasSupabaseClientEnv,
} from "../lib/supabaseClient";
import {
  buildDefaultSectionSeed,
  buildPhotoCardFromGuest,
  demoGalleryPhotos,
  demoStoryEvent,
  demoStorySections,
  demoStorySettings,
  extractCaptureDate,
  formatMonthYear,
  getFileExtension,
  getDefaultBirthDate,
  getMediaTypeFromExtension,
  getMediaTypeFromFile,
  groupPhotosByMonth,
  resolveStoryScaffold,
} from "../lib/storybook";
import type {
  EventRecord,
  GuestGalleryResponse,
  GuestStoryResponse,
  GuestUploadResponse,
  MediaType,
  ModeratorDeleteResponse,
  ModeratorStoryResponse,
  ModeratorUploadResponse,
  PhotoCard,
  PhotoRecord,
  StorySectionCard,
  StorySectionRecord,
  StorySettingsRecord,
} from "../lib/types";

type ScreenKey = "timeline" | "gallery" | "upload" | "admin" | "moderator" | "legacy";
type NoticeTone = "neutral" | "success" | "error";

type Notice = {
  tone: NoticeTone;
  message: string;
};

type GuestAccess = {
  eventCode: string;
  pin: string;
};

type BirthdayAppProps = {
  initialGuestAccess?: GuestAccess;
};

type UploadPreview = {
  id: string;
  file: File;
  url: string;
  capturedAt: string;
  mediaType: MediaType;
};

type AdminPhoto = PhotoRecord & {
  imageUrl: string | null;
  fullImageUrl?: string | null;
  mediaType?: MediaType;
};

type ModeratorPhoto = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  fullImageUrl: string | null;
  mediaType: MediaType;
  status: string;
  capturedAt: string;
  isVisible: boolean;
  timelineSectionId: string | null;
  timelineSortOrder: number;
};

const screenMap = new Map<string, ScreenKey>([
  ["/", "gallery"],
  ["/timeline", "gallery"],
  ["/gallery", "gallery"],
  ["/upload", "upload"],
  ["/admin", "admin"],
  ["/moderator", "moderator"],
]);

const storedEventIdKey = "birthday-photo-app.event-id";

const chapterColors = [
  "#F3EFE8",
  "#EBF2F8",
  "#EDF4EB",
  "#F0EBF5",
  "#EBF2F8",
  "#F5F2EB",
  "#EBF5F2",
  "#F5EDEF",
  "#EBF0F8",
  "#F5F0EB",
  "#ECF2F5",
  "#F5F2EF",
];

const chapterEmojis = ["🌙", "✨", "🦋", "🎭", "🌿", "🎉", "🗺️", "🏔️", "💬", "👣", "🌿", "🎂"];

const chapterMilestones = [
  "Hello, World!",
  "First Social Smile",
  "Lifting That Little Head",
  "First Belly Laugh",
  "Sitting with Support",
  "First Solids Adventure",
  "First Crawl!",
  "First Pull-to-Stand",
  'First "Mama" & "Dada"',
  "Walking into the Future",
  "First Outdoor Expedition",
  "Happy First Birthday, Vaayu!",
];

function HeaderIcon({
  kind,
}: {
  kind: "story" | "gallery" | "upload" | "settings";
}) {
  if (kind === "story") {
    return (
      <svg aria-hidden="true" className="storybook-tab-icon" viewBox="0 0 16 16">
        <path
          d="M2.75 3.75A1.75 1.75 0 0 1 4.5 2h4.75A2.25 2.25 0 0 1 11.5 4.25V13A2.6 2.6 0 0 0 9 11.75H4.5A1.75 1.75 0 0 0 2.75 13V3.75Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.35"
        />
        <path
          d="M11.5 4.25A2.25 2.25 0 0 1 13.75 2H14v11h-.25A2.6 2.6 0 0 0 11.5 11.75"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.35"
        />
      </svg>
    );
  }

  if (kind === "gallery") {
    return (
      <svg aria-hidden="true" className="storybook-tab-icon" viewBox="0 0 16 16">
        <rect
          x="2.25"
          y="3"
          width="8.5"
          height="8.5"
          rx="1.75"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.35"
        />
        <path
          d="M6.25 6.1h.01"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path
          d="m3.9 10 1.95-2.1 1.55 1.45 1.45-1.2 1.4 1.85"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.35"
        />
        <path
          d="M10.4 5.1h1.85A1.5 1.5 0 0 1 13.75 6.6v4.15a1.5 1.5 0 0 1-1.5 1.5H8.1"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.35"
        />
      </svg>
    );
  }

  if (kind === "upload") {
    return (
      <svg aria-hidden="true" className="storybook-tab-icon" viewBox="0 0 16 16">
        <path
          d="M4.75 5.25 6 3.75h4l1.25 1.5h1A1.75 1.75 0 0 1 14 7v4.25A1.75 1.75 0 0 1 12.25 13H3.75A1.75 1.75 0 0 1 2 11.25V7a1.75 1.75 0 0 1 1.75-1.75h1Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.35"
        />
        <circle
          cx="8"
          cy="8.8"
          r="2.2"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.35"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="storybook-admin-icon" viewBox="0 0 16 16">
      <path
        d="m8 2.4.9.55 1.05-.15.55.9 1 .35v1.05l.75.75-.35 1 .35 1-.75.75V9.7l-1 .35-.55.9-1.05-.15L8 11.35l-.9-.55-1.05.15-.55-.9-1-.35V8.65l-.75-.75.35-1-.35-1 .75-.75V4.1l1-.35.55-.9 1.05.15L8 2.4Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.05"
      />
      <circle cx="8" cy="6.9" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.05" />
    </svg>
  );
}

function BrandSunMark() {
  return (
    <span className="storybook-brand-mark" aria-hidden="true">
      <span className="storybook-brand-mark-inner">
        <svg height="20" viewBox="0 0 240 240" width="20" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient
              cx="0"
              cy="0"
              gradientTransform="translate(120 120) rotate(90) scale(60)"
              gradientUnits="userSpaceOnUse"
              id="sunCore"
              r="1"
            >
              <stop offset="0%" stopColor="#FFE9A8" />
              <stop offset="60%" stopColor="#FFD76A" />
              <stop offset="100%" stopColor="#FFBE3D" />
            </radialGradient>

            <filter height="200%" id="glow" width="200%" x="-50%" y="-50%">
              <feGaussianBlur result="blur" stdDeviation="6" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g className="storybook-sun-rays">
            {Array.from({ length: 12 }).map((_, index) => {
              const angle = index * 30;
              const innerX = 120 + Math.cos((angle * Math.PI) / 180) * 64;
              const innerY = 120 + Math.sin((angle * Math.PI) / 180) * 64;
              const outerX = 120 + Math.cos((angle * Math.PI) / 180) * 94;
              const outerY = 120 + Math.sin((angle * Math.PI) / 180) * 94;

              return (
                <line
                  key={angle}
                  stroke="#FFC84F"
                  strokeLinecap="round"
                  strokeWidth="10"
                  x1={innerX}
                  x2={outerX}
                  y1={innerY}
                  y2={outerY}
                />
              );
            })}
          </g>
          <circle cx="120" cy="120" fill="url(#sunCore)" filter="url(#glow)" r="52" />
          <circle cx="120" cy="120" fill="#FFF4C7" opacity="0.45" r="26" />
        </svg>
      </span>
    </span>
  );
}

function OrbitSunEarth({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 260 260"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="130"
        cy="130"
        r="84"
        stroke="#D8D8D8"
        strokeDasharray="5 7"
        strokeWidth="2.5"
      />

      <g>
        <circle cx="130" cy="130" fill="#FFC83D" r="30" />
        <circle cx="120" cy="119" fill="#FFE7A3" opacity="0.75" r="8" />

        <g stroke="#FFB800" strokeLinecap="round" strokeWidth="4.5">
          <line x1="130" x2="130" y1="82" y2="66" />
          <line x1="130" x2="130" y1="194" y2="178" />
          <line x1="82" x2="66" y1="130" y2="130" />
          <line x1="194" x2="178" y1="130" y2="130" />
          <line x1="96" x2="84" y1="96" y2="84" />
          <line x1="164" x2="176" y1="164" y2="176" />
          <line x1="96" x2="84" y1="164" y2="176" />
          <line x1="164" x2="176" y1="96" y2="84" />
        </g>
      </g>

      <g className="storybook-orbit-group">
        <g transform="translate(214 130)">
          <circle cx="0" cy="0" fill="#4DA6FF" r="19" />
          <path
            d="M -2 -11 C 2 -12, 7 -11, 9 -8 C 11 -6, 10 -3, 8 -2 C 7 -1, 6 1, 7 3 C 8 6, 7 9, 4 11 C 2 12, 0 10, -1 8 C -2 6, -3 4, -5 3 C -7 2, -8 0, -7 -2 C -6 -4, -5 -5, -4 -7 C -4 -9, -3 -10, -2 -11 Z"
            fill="#58B95A"
          />
          <path
            d="M -10 -1 C -8 -2, -6 -1, -6 1 C -6 3, -7 4, -8 6 C -8 8, -7 10, -8 12 C -9 13, -11 12, -11 10 C -11 8, -12 6, -12 4 C -12 2, -11 0, -10 -1 Z"
            fill="#58B95A"
          />
          <path
            d="M 2 -14 C 4 -15, 6 -14, 6 -12 C 5 -11, 3 -10, 1 -11 C 0 -12, 0 -13, 2 -14 Z"
            fill="#58B95A"
          />
          <path
            d="M 9 8 C 11 8, 12 9, 12 11 C 11 12, 9 13, 7 12 C 6 11, 7 9, 9 8 Z"
            fill="#58B95A"
          />
          <circle cx="12" cy="2" fill="#58B95A" r="1.1" />
          <circle cx="-13" cy="8" fill="#58B95A" r="1.2" />
          <ellipse cx="0" cy="-15" fill="#EAF6FF" opacity="0.55" rx="5" ry="2" />
          <circle cx="-6" cy="-7" fill="white" opacity="0.22" r="4" />
        </g>
      </g>
    </svg>
  );
}

function MoonStars({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 200 140"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className="storybook-moon-float">
        <circle cx="52" cy="62" fill="#DDE3F3" r="22" />
        <path
          d="M66 43C60 39 51 38 43 41C31 46 25 58 27 69C29 81 39 90 51 92C60 93 68 90 73 85C67 87 61 87 55 85C43 83 35 75 33 65C31 56 34 47 41 41C48 36 58 35 66 43Z"
          fill="#F5F7FD"
        />
        <circle cx="44" cy="56" fill="#C8D0E6" opacity="0.45" r="3.2" />
        <circle cx="42" cy="72" fill="#C8D0E6" opacity="0.4" r="4.4" />
        <circle cx="57" cy="76" fill="#C8D0E6" opacity="0.45" r="2.8" />
      </g>

      <g className="storybook-star storybook-star-1">
        <path d="M112 28V40" stroke="#D8C27A" strokeLinecap="round" strokeWidth="2.4" />
        <path d="M106 34H118" stroke="#D8C27A" strokeLinecap="round" strokeWidth="2.4" />
      </g>

      <g className="storybook-star storybook-star-2">
        <path d="M152 50V62" stroke="#D8C27A" strokeLinecap="round" strokeWidth="2.4" />
        <path d="M146 56H158" stroke="#D8C27A" strokeLinecap="round" strokeWidth="2.4" />
      </g>

      <g className="storybook-star storybook-star-3">
        <path d="M132 92V102" stroke="#D8C27A" strokeLinecap="round" strokeWidth="2.2" />
        <path d="M127 97H137" stroke="#D8C27A" strokeLinecap="round" strokeWidth="2.2" />
      </g>

      <circle className="storybook-star storybook-star-4" cx="170" cy="30" fill="#E3CF92" r="2.2" />
      <circle className="storybook-star storybook-star-5" cx="164" cy="88" fill="#E3CF92" r="2.4" />
    </svg>
  );
}

function getScreen(pathname: string): ScreenKey {
  return screenMap.get(pathname) || "legacy";
}

function getChapterTheme(index: number) {
  return {
    color: chapterColors[index % chapterColors.length],
    emoji: chapterEmojis[index % chapterEmojis.length],
    milestone: chapterMilestones[index % chapterMilestones.length],
  };
}

async function createSignedViewUrls(paths: string[]) {
  if (paths.length === 0) {
    return new Map<string, string>();
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from("event-photos").createSignedUrls(paths, 3600);

  if (error || !data) {
    throw new Error(error?.message || "Unable to prepare image URLs.");
  }

  return new Map(data.map((entry) => [entry.path, entry.signedUrl]));
}

function mapModeratorPhoto(photo: {
  id: string;
  title: string;
  subtitle: string;
  image_url: string | null;
  full_image_url?: string | null;
  media_type?: MediaType;
  status: string;
  captured_at?: string;
  is_visible?: boolean;
  timeline_section_id?: string | null;
  timeline_sort_order?: number;
}): ModeratorPhoto {
  return {
    id: photo.id,
    title: photo.title,
    subtitle: photo.subtitle,
    imageUrl: photo.image_url,
    fullImageUrl: photo.full_image_url ?? photo.image_url ?? null,
    mediaType: photo.media_type ?? "image",
    status: photo.status,
    capturedAt: photo.captured_at || new Date().toISOString(),
    isVisible: photo.is_visible ?? true,
    timelineSectionId: photo.timeline_section_id ?? null,
    timelineSortOrder: photo.timeline_sort_order ?? 0,
  };
}

function buildStorySectionsFromModerator(data: ModeratorStoryResponse): StorySectionCard[] {
  return data.sections.map((section) => ({
    id: section.id,
    event_id: data.event.id,
    label: section.label,
    title: section.title,
    subtitle: section.subtitle,
    story_text: section.story_text,
    sort_order: section.sort_order,
    visible: section.visible,
    created_at: data.event.created_at,
    updated_at: data.event.created_at,
    photos: section.photos
      .filter((photo) => photo.is_visible !== false && photo.status === "approved")
      .map((photo) => ({
        id: photo.id,
        title: photo.title,
        subtitle: photo.subtitle,
        status: "approved",
        imageUrl: photo.image_url,
        fullImageUrl: photo.full_image_url ?? photo.image_url ?? null,
        mediaType: photo.media_type ?? "image",
        capturedAt: photo.captured_at || new Date().toISOString(),
      })),
  }));
}

function buildGalleryPhotosFromModerator(data: ModeratorStoryResponse): PhotoCard[] {
  return data.photos
    .filter((photo) => photo.is_visible !== false && photo.status === "approved")
    .map((photo) => ({
      id: photo.id,
      title: photo.title,
      subtitle: photo.subtitle,
      status: "approved",
      imageUrl: photo.image_url,
      fullImageUrl: photo.full_image_url ?? photo.image_url ?? null,
      mediaType: photo.media_type ?? "image",
      capturedAt: photo.captured_at || new Date().toISOString(),
    }));
}

function MediaFrame({
  photo,
  className,
  alt,
  autoPlay = false,
  controls = false,
  muted = true,
  loop = false,
}: {
  photo: Pick<PhotoCard, "imageUrl" | "fullImageUrl" | "mediaType" | "title">;
  className?: string;
  alt?: string;
  autoPlay?: boolean;
  controls?: boolean;
  muted?: boolean;
  loop?: boolean;
}) {
  const src = photo.imageUrl || photo.fullImageUrl || "";
  if (!src) {
    return <span />;
  }

  if (photo.mediaType === "video") {
    return (
      <video
        className={className}
        controls={controls}
        loop={loop}
        muted={muted}
        playsInline
        preload="metadata"
        {...(autoPlay ? { autoPlay: true } : {})}
      >
        <source src={src} />
      </video>
    );
  }

  return <img alt={alt || photo.title} className={className} src={src} />;
}

function normalizePin(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

function preventEnterSubmit(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") {
    event.preventDefault();
  }
}

function AccessGate({
  eventCode,
  pin,
  onEventCodeChange,
  onPinChange,
  onSubmit,
  title,
  body,
  cta,
}: {
  eventCode: string;
  pin: string;
  onEventCodeChange: (value: string) => void;
  onPinChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <section className="storybook-section">
      <article className="storybook-card access-card">
        <p className="storybook-overline">Family Access</p>
        <h2>{title}</h2>
        <p className="storybook-copy">{body}</p>
        <form className="storybook-form" onSubmit={onSubmit}>
          <label className="storybook-field">
            <span>Event code</span>
            <input
              autoCapitalize="characters"
              value={eventCode}
              onChange={(event) => onEventCodeChange(event.target.value.toUpperCase())}
              placeholder="VAAYU"
            />
          </label>
          <label className="storybook-field">
            <span>PIN</span>
            <input
              autoComplete="off"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]*"
              value={pin}
              onChange={(event) => onPinChange(normalizePin(event.target.value))}
              onKeyDown={preventEnterSubmit}
              placeholder="••••"
              type="tel"
            />
          </label>
          <button className="storybook-button storybook-button-primary" type="submit">
            {cta}
          </button>
        </form>
      </article>
    </section>
  );
}

function StorybookLoading({
  mode,
}: {
  mode: "timeline" | "gallery";
}) {
  const isGallery = mode === "gallery";

  return (
    <section className={`storybook-section loading-shell ${isGallery ? "loading-shell-gallery" : ""}`}>
      <article className="storybook-card loading-card">
        <div className="loading-copy">
          <p className="storybook-overline">Opening Vaayu&apos;s scrapbook</p>
          <h2>{isGallery ? "Loading birthday gallery" : "Loading the story timeline"}</h2>
          <p className="storybook-copy">
            {isGallery
              ? "Preparing thumbnails, monthly groupings, and the latest memories from Vaayu&apos;s first year."
              : "Gathering chapters, featured photographs, and the milestone storybook."}
          </p>
        </div>

        <div className={`loading-visual ${isGallery ? "loading-visual-gallery" : ""}`} aria-hidden="true">
          <span className="loading-photo loading-photo-a" />
          <span className="loading-photo loading-photo-b" />
          <span className="loading-photo loading-photo-c" />
          <span className="loading-photo loading-photo-d" />
        </div>

        <div className="loading-lines" aria-hidden="true">
          <span className="loading-line loading-line-wide" />
          <span className="loading-line" />
          <span className="loading-line loading-line-short" />
        </div>
      </article>
    </section>
  );
}

function StoryTimelinePage({
  event,
  settings,
  sections,
  onOpenGallery,
}: {
  event: EventRecord | null;
  settings: StorySettingsRecord | null;
  sections: StorySectionCard[];
  onOpenGallery: () => void;
}) {
  const [activeChapterId, setActiveChapterId] = useState(sections[0]?.id || "");
  const [revealedChapterIds, setRevealedChapterIds] = useState<string[]>([]);
  const [lightboxState, setLightboxState] = useState<{
    photos: PhotoCard[];
    selectedIndex: number;
  } | null>(null);

  useEffect(() => {
    if (sections.length === 0) return;
    setActiveChapterId((current) => current || sections[0].id);
    setRevealedChapterIds((current) => {
      const next = new Set(current);
      next.add(sections[0].id);
      return Array.from(next);
    });
  }, [sections]);

  useEffect(() => {
    if (typeof window === "undefined" || sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
        if (visible[0]) {
          setActiveChapterId(visible[0].target.id.replace("chapter-", ""));
        }
        if (visible.length > 0) {
          setRevealedChapterIds((current) => {
            const next = new Set(current);
            visible.forEach((entry) => next.add(entry.target.id.replace("chapter-", "")));
            return Array.from(next);
          });
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
    );

    sections.forEach((section) => {
      const element = document.getElementById(`chapter-${section.id}`);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [sections]);

  function openTimelineLightbox(photos: PhotoCard[], photoId: string) {
    const selectedIndex = photos.findIndex((photo) => photo.id === photoId);
    setLightboxState({
      photos,
      selectedIndex: selectedIndex >= 0 ? selectedIndex : 0,
    });
  }

  return (
    <>
      <section className="timeline-cover-section">
        <div className="timeline-cover-decor" aria-hidden="true">
          <span className="timeline-moon" />
          <span className="timeline-star timeline-star-a" />
          <span className="timeline-star timeline-star-b" />
          <span className="timeline-cloud timeline-cloud-a" />
          <span className="timeline-cloud timeline-cloud-b" />
          <span className="timeline-spark timeline-spark-a" />
          <span className="timeline-spark timeline-spark-b" />
          <span className="timeline-balloon-soft timeline-balloon-soft-a" />
          <span className="timeline-balloon-soft timeline-balloon-soft-b" />
          <span className="timeline-orbit-ring" />
        </div>

        <div className="timeline-cover-inner">
          <p className="timeline-script">A Storybook for</p>
          <h1 className="timeline-cover-title">{event?.title || "Vaayu"}</h1>
          <div className="timeline-flourish" aria-hidden="true" />
          <p className="timeline-cover-kicker">His First Year</p>
          <p className="timeline-cover-subtitle">
            {settings?.cover_subtitle || "Twelve chapters. Infinite love."}
          </p>
          <div className="timeline-cover-actions">
            <a className="timeline-cover-primary" href="#timeline">
              Read the Story
            </a>
            <button className="timeline-cover-secondary" onClick={onOpenGallery} type="button">
              View Gallery
            </button>
          </div>
          <div className="timeline-scroll-indicator" aria-hidden="true">
            <span>Scroll</span>
            <i />
          </div>
        </div>
      </section>

      <div className="timeline-side-nav" aria-label="Story chapters">
        {sections.map((section) => {
          const active = section.id === activeChapterId;
          return (
            <a className="timeline-side-link" href={`#chapter-${section.id}`} key={section.id}>
              <span className={`timeline-side-dot ${active ? "timeline-side-dot-active" : ""}`} />
              <span className={`timeline-side-label ${active ? "timeline-side-label-active" : ""}`}>
                {section.label}
              </span>
            </a>
          );
        })}
      </div>

      <section className="timeline-sections" id="timeline">
        {sections.map((section, index) => {
          const reverse = index % 2 === 1;
          const theme = getChapterTheme(index);
          const featuredPhoto = section.photos[0] || null;
          const extraPhotos = section.photos.slice(1, 3);

          return (
            <article
              className={`timeline-editorial-section ${reverse ? "timeline-editorial-section-reverse" : ""} ${
                revealedChapterIds.includes(section.id) ? "timeline-editorial-section-visible" : ""
              }`}
              id={`chapter-${section.id}`}
              key={section.id}
              style={{ background: theme.color }}
            >
              <div className="timeline-editorial-decor" aria-hidden="true">
                <span className="timeline-editorial-star" />
                <span className="timeline-editorial-heart" />
                <span className="timeline-editorial-cloud" />
              </div>

              <div className="timeline-editorial-shell">
                <div className="timeline-editorial-media">
                  {featuredPhoto?.imageUrl ? (
                    <button
                      className="timeline-editorial-photo"
                      onClick={() => openTimelineLightbox(section.photos, featuredPhoto.id)}
                      type="button"
                    >
                      <div className="timeline-editorial-photo-frame">
                        <MediaFrame photo={featuredPhoto} />
                      </div>
                    </button>
                  ) : (
                    <div className="timeline-editorial-placeholder">
                      <span className="timeline-editorial-placeholder-emoji">{theme.emoji}</span>
                      <p>Photos coming soon</p>
                    </div>
                  )}

                  {extraPhotos.length > 0 ? (
                    <div className="timeline-editorial-extra">
                      {extraPhotos.map((photo, photoIndex) => (
                        <button
                          className={`timeline-editorial-extra-photo timeline-editorial-extra-photo-${photoIndex}`}
                          key={photo.id}
                          onClick={() => openTimelineLightbox(section.photos, photo.id)}
                          type="button"
                        >
                          <MediaFrame photo={photo} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="timeline-editorial-copy">
                  <span className="timeline-editorial-ghost">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="timeline-editorial-label">{section.label}</p>
                  <div className="timeline-flourish timeline-flourish-left" aria-hidden="true" />
                  <h2>{section.title}</h2>
                  {section.subtitle ? <p className="timeline-editorial-subtitle">{section.subtitle}</p> : null}
                  {section.story_text ? <p className="timeline-editorial-body">{section.story_text}</p> : null}
                  <span className="timeline-milestone-pill">{theme.milestone}</span>
                  <div className="timeline-editorial-footer">
                    <span className="timeline-editorial-heart-mark">♥</span>
                    <span>a memory to treasure forever</span>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="timeline-closing-section">
        <div className="timeline-closing-inner">
          <span className="timeline-closing-moon" aria-hidden="true" />
          <h2>And so the story continues…</h2>
          <p>
            One year of firsts, of laughter, of love beyond measure. But the best chapters are still being written,
            one magical day at a time.
          </p>
          <div className="timeline-cover-actions">
            <button className="timeline-cover-primary" onClick={onOpenGallery} type="button">
              View the Gallery
            </button>
            <a className="timeline-cover-secondary" href="#timeline">
              Read Again
            </a>
          </div>
          <p className="timeline-closing-signoff">Made with love, for Vaayu ✦</p>
        </div>
      </section>

      <Lightbox
        onClose={() => setLightboxState(null)}
        onMove={(direction) => {
          setLightboxState((current) => {
            if (!current) return current;
            return {
              ...current,
              selectedIndex:
                (current.selectedIndex + direction + current.photos.length) % current.photos.length,
            };
          });
        }}
        photos={lightboxState?.photos || []}
        selectedIndex={lightboxState?.selectedIndex ?? null}
      />
    </>
  );
}

function Lightbox({
  photos,
  selectedIndex,
  onClose,
  onMove,
}: {
  photos: PhotoCard[];
  selectedIndex: number | null;
  onClose: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  if (selectedIndex === null || !photos[selectedIndex]) {
    return null;
  }

  const active = photos[selectedIndex];

  return (
    <div className="lightbox-shell" onClick={onClose} role="dialog" aria-modal="true">
      <button
        aria-label="Close media viewer"
        className="lightbox-close"
        onClick={onClose}
        type="button"
      >
        ×
      </button>
      <button
        aria-label="Previous media"
        className="lightbox-nav lightbox-nav-left"
        onClick={(event) => {
          event.stopPropagation();
          onMove(-1);
        }}
        type="button"
      >
        ‹
      </button>
      <figure className="lightbox-frame" onClick={(event) => event.stopPropagation()}>
        {active.fullImageUrl || active.imageUrl ? (
          <MediaFrame
            alt={active.title}
            autoPlay={active.mediaType === "video"}
            controls={active.mediaType === "video"}
            loop={active.mediaType === "video"}
            muted={false}
            photo={{ ...active, imageUrl: active.fullImageUrl || active.imageUrl }}
          />
        ) : null}
        <figcaption>
          <div>
            <strong>{active.title}</strong>
            <span>
              {selectedIndex + 1} / {photos.length}
            </span>
          </div>
          {active.fullImageUrl ? (
            <a
              className="lightbox-download"
              download
              href={active.fullImageUrl}
              onClick={(event) => event.stopPropagation()}
              rel="noreferrer"
              target="_blank"
            >
              Download full size
            </a>
          ) : null}
        </figcaption>
      </figure>
      <button
        aria-label="Next media"
        className="lightbox-nav lightbox-nav-right"
        onClick={(event) => {
          event.stopPropagation();
          onMove(1);
        }}
        type="button"
      >
        ›
      </button>
    </div>
  );
}

function GalleryPage({
  event,
  photos,
  onOpenUpload,
}: {
  event: EventRecord | null;
  photos: PhotoCard[];
  onOpenUpload: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const monthGroups = useMemo(() => groupPhotosByMonth(photos), [photos]);
  const [activeFilter, setActiveFilter] = useState("all");

  function getGalleryCardClass(index: number) {
    const pattern = [
      "gallery-package-card-tall",
      "gallery-package-card-square",
      "gallery-package-card-square",
      "gallery-package-card-tall",
      "gallery-package-card-feature",
    ] as const;
    return pattern[index % pattern.length];
  }

  const filteredPhotos = useMemo(() => {
    if (activeFilter === "all") return photos;
    return photos.filter((photo) => {
      const date = new Date(photo.capturedAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return key === activeFilter;
    });
  }, [activeFilter, photos]);

  const filteredGroups = useMemo(() => {
    if (activeFilter === "all") return monthGroups;
    return monthGroups.filter((group) => group.key === activeFilter);
  }, [activeFilter, monthGroups]);

  return (
    <>
      <section className="gallery-page-shell">
        <div className="gallery-page-backdrop" aria-hidden="true">
          <span className="gallery-backdrop-star gallery-backdrop-star-a" />
          <span className="gallery-backdrop-star gallery-backdrop-star-b" />
          <span className="gallery-backdrop-moon" />
          <span className="gallery-backdrop-cloud gallery-backdrop-cloud-a" />
          <span className="gallery-backdrop-cloud gallery-backdrop-cloud-b" />
          <span className="gallery-backdrop-spark" />
        </div>

        <div className="gallery-page-inner">
          <div className="gallery-page-hero">
            <p className="gallery-page-script">Vaayu&apos;s</p>
            <h1>Photo Gallery</h1>
            <p className="gallery-page-meta">
              {filteredPhotos.length} moments from {event?.title || "Vaayu"}&apos;s first year
            </p>
          </div>

          {monthGroups.length > 0 ? (
            <div className="gallery-filter-bar">
              <button
                className={`gallery-filter-chip ${activeFilter === "all" ? "gallery-filter-chip-active" : ""}`}
                onClick={() => setActiveFilter("all")}
                type="button"
              >
                All Photos
              </button>
              {monthGroups.map((group) => (
                <button
                  className={`gallery-filter-chip ${activeFilter === group.key ? "gallery-filter-chip-active" : ""}`}
                  key={group.key}
                  onClick={() => setActiveFilter(group.key)}
                  type="button"
                >
                  {group.label}
                </button>
              ))}
            </div>
          ) : null}

          {filteredPhotos.length === 0 ? (
            <article className="storybook-card empty-card">
              <h2>No photos yet for this month</h2>
              <p className="storybook-copy">Once a memory is uploaded, it will appear in Vaayu&apos;s gallery here.</p>
            </article>
          ) : (
            filteredGroups.map((group) => (
              <section className="gallery-month-block" key={group.key}>
                {activeFilter === "all" ? (
                  <div className="gallery-month-divider">
                    <span />
                    <p>{group.label}</p>
                    <span />
                  </div>
                ) : null}

                <div className="gallery-package-grid">
                  {group.photos.map((photo, index) => (
                    <button
                      className={`gallery-package-card ${getGalleryCardClass(index)}`}
                      key={photo.id}
                      onClick={() => setSelectedIndex(filteredPhotos.findIndex((item) => item.id === photo.id))}
                      type="button"
                    >
                      <div className="gallery-package-card-media">
                        {photo.imageUrl ? <MediaFrame photo={photo} /> : <span />}
                      </div>
                      <div className="gallery-package-card-overlay">
                        <span>{group.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}

          <div className="gallery-bottom-cta">
            <p>Have photos to share?</p>
            <button className="timeline-cover-primary" onClick={onOpenUpload} type="button">
              Upload Photos
            </button>
          </div>
        </div>
      </section>

      <Lightbox
        onClose={() => setSelectedIndex(null)}
        onMove={(direction) => {
          setSelectedIndex((current) => {
            if (current === null) return current;
            return (current + direction + filteredPhotos.length) % filteredPhotos.length;
          });
        }}
        photos={filteredPhotos}
        selectedIndex={selectedIndex}
      />
    </>
  );
}

function UploadPage({
  eventCode,
  pin,
  previews,
  busy,
  notice,
  onEventCodeChange,
  onPinChange,
  onFilesSelected,
  onRemovePreview,
  onSubmit,
}: {
  eventCode: string;
  pin: string;
  previews: UploadPreview[];
  busy: boolean;
  notice: Notice;
  onEventCodeChange: (value: string) => void;
  onPinChange: (value: string) => void;
  onFilesSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemovePreview: (id: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const isReady = previews.length > 0;

  return (
    <section className="upload-page-shell">
      <div className="upload-page-backdrop" aria-hidden="true">
        <span className="gallery-backdrop-star gallery-backdrop-star-a" />
        <span className="gallery-backdrop-moon" />
        <span className="gallery-backdrop-cloud gallery-backdrop-cloud-a" />
        <span className="gallery-backdrop-cloud gallery-backdrop-cloud-b" />
        <span className="gallery-backdrop-spark" />
      </div>

      <div className="upload-page-inner">
        <div className="upload-package-hero">
          <div className="upload-package-icon" aria-hidden="true">
            <span />
          </div>
          <h1>Share Photos or Videos</h1>
          <p>Add to Vaayu&apos;s memory collection. We&apos;ll detect the month automatically.</p>
        </div>

        <form className="upload-package-card" onSubmit={onSubmit}>
          <div className="upload-package-fields">
            <label className="storybook-field">
              <span>Event code</span>
              <input
                autoCapitalize="characters"
                placeholder="VAAYU"
                value={eventCode}
                onChange={(event) => onEventCodeChange(event.target.value.toUpperCase())}
              />
            </label>
            <label className="storybook-field">
              <span>PIN</span>
              <input
                autoComplete="off"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]*"
                placeholder="••••"
                value={pin}
                onChange={(event) => onPinChange(normalizePin(event.target.value))}
                onKeyDown={preventEnterSubmit}
                type="tel"
              />
            </label>
          </div>

          <label className="upload-package-dropzone">
            <input accept="image/*,video/*" multiple onChange={onFilesSelected} type="file" />
            <div className="upload-package-dropzone-icon">+</div>
            <p>
              <strong>Click to upload</strong> or drag &amp; drop
            </p>
            <small>JPG, PNG, MP4, MOV - capture date detected automatically when available</small>
          </label>

          {isReady ? (
            <div className="upload-package-preview-stack">
              <div className="upload-package-preview-grid">
                {previews.map((preview) => (
                  <article className="upload-package-preview" key={preview.id}>
                    <div className="upload-package-preview-frame">
                      <MediaFrame
                        alt={preview.file.name}
                        autoPlay={preview.mediaType === "video"}
                        loop={preview.mediaType === "video"}
                        photo={{
                          title: preview.file.name,
                          imageUrl: preview.url,
                          fullImageUrl: preview.url,
                          mediaType: preview.mediaType,
                        }}
                      />
                    </div>
                    <div className="upload-package-preview-tag">
                      {formatMonthYear(preview.capturedAt)}
                    </div>
                    <button
                      className="upload-package-preview-remove"
                      onClick={() => onRemovePreview(preview.id)}
                      type="button"
                    >
                      ×
                    </button>
                  </article>
                ))}
              </div>

              <div className="upload-package-summary">
                ✦ {previews.length} file{previews.length !== 1 ? "s" : ""} ready to upload - capture dates detected automatically when available
              </div>
            </div>
          ) : null}

          <button className="upload-package-submit" disabled={busy || !isReady} type="submit">
            {busy ? "Submitting..." : `Submit ${previews.length || ""} File${previews.length === 1 ? "" : previews.length > 1 ? "s" : ""}`}
          </button>

          <div className="upload-package-info">
            <p className="upload-package-info-title">A few things to know</p>
            <ul>
              <li>Your photos are grouped by the date they were taken</li>
              <li>Photos and videos appear in Vaayu&apos;s album as soon as the upload completes</li>
              <li>You can upload multiple photos or short videos at once</li>
              <li>Clear, well-lit photos look most beautiful in the gallery</li>
            </ul>
            <p className={`inline-notice inline-notice-${notice.tone}`}>{notice.message}</p>
          </div>
        </form>
      </div>
    </section>
  );
}

function AdminPage({
  session,
  authBusy,
  adminBusy,
  email,
  password,
  fullName,
  adminEventCode,
  notice,
  event,
  settings,
  sections,
  photos,
  onEmailChange,
  onPasswordChange,
  onFullNameChange,
  onAuth,
  onAdminEventCodeChange,
  onLoadEvent,
  onSettingsChange,
  onSyncSectionCount,
  onSectionChange,
  onSectionReorder,
  onPhotoChange,
  onPhotoDelete,
}: {
  session: Session | null;
  authBusy: boolean;
  adminBusy: boolean;
  email: string;
  password: string;
  fullName: string;
  adminEventCode: string;
  notice: Notice;
  event: EventRecord | null;
  settings: StorySettingsRecord | null;
  sections: StorySectionRecord[];
  photos: AdminPhoto[];
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onFullNameChange: (value: string) => void;
  onAuth: (mode: "signin" | "signup") => Promise<void>;
  onAdminEventCodeChange: (value: string) => void;
  onLoadEvent: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSettingsChange: (updates: Partial<StorySettingsRecord>) => Promise<void>;
  onSyncSectionCount: () => Promise<void>;
  onSectionChange: (sectionId: string, updates: Partial<StorySectionRecord>) => Promise<void>;
  onSectionReorder: (sectionId: string, direction: -1 | 1) => Promise<void>;
  onPhotoChange: (photoId: string, updates: Partial<PhotoRecord>) => Promise<void>;
  onPhotoDelete: (photo: AdminPhoto) => Promise<void>;
}) {
  const photosBySection = useMemo(() => {
    return sections.map((section) => ({
      sectionId: section.id,
      items: photos
        .filter((photo) => photo.timeline_section_id === section.id)
        .sort((left, right) => left.timeline_sort_order - right.timeline_sort_order),
    }));
  }, [photos, sections]);

  if (!session) {
    return (
      <section className="storybook-section">
        <article className="storybook-card admin-auth-card">
          <p className="storybook-overline">Admin Page</p>
          <h1>Open the story editor</h1>
          <p className="storybook-copy">
            Sign in with your host account to manage photo visibility and the curated story timeline.
          </p>
          <div className="storybook-form">
            <label className="storybook-field">
              <span>Display name</span>
              <input value={fullName} onChange={(event) => onFullNameChange(event.target.value)} />
            </label>
            <label className="storybook-field">
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} />
            </label>
            <label className="storybook-field">
              <span>Password</span>
              <input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} />
            </label>
            <div className="admin-auth-actions">
              <button
                className="storybook-button storybook-button-primary"
                disabled={authBusy}
                onClick={() => void onAuth("signin")}
                type="button"
              >
                {authBusy ? "Working..." : "Sign in"}
              </button>
              <button
                className="storybook-button storybook-button-secondary"
                disabled={authBusy}
                onClick={() => void onAuth("signup")}
                type="button"
              >
                Create account
              </button>
            </div>
            <p className={`inline-notice inline-notice-${notice.tone}`}>{notice.message}</p>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="storybook-section">
      <article className="storybook-card admin-intro-card">
        <div>
          <p className="storybook-overline">Admin Page</p>
          <h1>Manage visibility and story chapters</h1>
          <p className="storybook-copy">
            Show or hide photos, assign them to chapters, edit story copy, and keep the scrapbook curated.
          </p>
        </div>
        <form className="admin-open-event-form" onSubmit={(eventForm) => void onLoadEvent(eventForm)}>
          <label className="storybook-field">
            <span>Event code</span>
            <input
              autoCapitalize="characters"
              placeholder="VAAYU"
              value={adminEventCode}
              onChange={(eventField) => onAdminEventCodeChange(eventField.target.value.toUpperCase())}
            />
          </label>
          <button className="storybook-button storybook-button-primary" disabled={adminBusy} type="submit">
            {adminBusy ? "Opening..." : "Open admin"}
          </button>
        </form>
      </article>

      {event ? (
        <>
          <section className="admin-layout">
            <article className="storybook-card settings-card">
              <h2>{event.title}</h2>
              <div className="settings-grid">
                <label className="storybook-field">
                  <span>Grouping</span>
                  <select
                    value={settings?.grouping || "month"}
                    onChange={(eventField) => void onSettingsChange({ grouping: eventField.target.value as "month" | "year" })}
                  >
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </select>
                </label>
                <label className="storybook-field">
                  <span>Number of sections</span>
                  <input
                    min={1}
                    max={24}
                    type="number"
                    value={settings?.section_count || 12}
                    onChange={(eventField) =>
                      void onSettingsChange({ section_count: Number(eventField.target.value) || 12 })
                    }
                  />
                </label>
                <label className="storybook-field">
                  <span>Cover title</span>
                  <input
                    value={settings?.cover_title || ""}
                    onChange={(eventField) => void onSettingsChange({ cover_title: eventField.target.value })}
                  />
                </label>
                <label className="storybook-field">
                  <span>Cover subtitle</span>
                  <input
                    value={settings?.cover_subtitle || ""}
                    onChange={(eventField) => void onSettingsChange({ cover_subtitle: eventField.target.value })}
                  />
                </label>
              </div>
              <button className="storybook-button storybook-button-secondary" onClick={() => void onSyncSectionCount()} type="button">
                Sync section count
              </button>
            </article>

            <article className="storybook-card sections-card">
              <h2>Story chapters</h2>
              <div className="admin-section-list">
                {sections.map((section, index) => (
                  <article className="admin-section-card" key={section.id}>
                    <div className="admin-section-toolbar">
                      <strong>{section.label}</strong>
                      <div>
                        <button onClick={() => void onSectionReorder(section.id, -1)} type="button">
                          ↑
                        </button>
                        <button onClick={() => void onSectionReorder(section.id, 1)} type="button">
                          ↓
                        </button>
                      </div>
                    </div>
                    <div className="settings-grid">
                      <label className="storybook-field">
                        <span>Label</span>
                        <input
                          value={section.label}
                          onChange={(eventField) => void onSectionChange(section.id, { label: eventField.target.value })}
                        />
                      </label>
                      <label className="storybook-field">
                        <span>Title</span>
                        <input
                          value={section.title}
                          onChange={(eventField) => void onSectionChange(section.id, { title: eventField.target.value })}
                        />
                      </label>
                      <label className="storybook-field">
                        <span>Subtitle</span>
                        <input
                          value={section.subtitle || ""}
                          onChange={(eventField) => void onSectionChange(section.id, { subtitle: eventField.target.value })}
                        />
                      </label>
                      <label className="storybook-field">
                        <span>Visible</span>
                        <select
                          value={String(section.visible)}
                          onChange={(eventField) =>
                            void onSectionChange(section.id, { visible: eventField.target.value === "true" })
                          }
                        >
                          <option value="true">Visible</option>
                          <option value="false">Hidden</option>
                        </select>
                      </label>
                    </div>
                    <label className="storybook-field">
                      <span>Story text</span>
                      <textarea
                        rows={4}
                        value={section.story_text || ""}
                        onChange={(eventField) => void onSectionChange(section.id, { story_text: eventField.target.value })}
                      />
                    </label>
                    <div className="section-photo-pill-row">
                      {(photosBySection.find((item) => item.sectionId === section.id)?.items || []).map((photo) => (
                        <span className="section-photo-pill" key={photo.id}>
                          {photo.caption || "Photo"} · #{photo.timeline_sort_order}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </section>

          <article className="storybook-card photos-card">
            <div className="photos-card-heading">
              <div>
                <h2>Photo controls</h2>
                <p className="storybook-copy">Visibility, deletion, and timeline assignment all happen here.</p>
              </div>
            </div>
            <div className="admin-photo-grid">
              {photos.map((photo) => (
                <article className="admin-photo-card" key={photo.id}>
                  <div className="admin-photo-frame">
                    {photo.imageUrl ? (
                      <MediaFrame
                        alt={photo.caption || "Photo"}
                        photo={{
                          title: photo.caption || "Photo",
                          imageUrl: photo.imageUrl,
                          fullImageUrl: photo.fullImageUrl ?? photo.imageUrl,
                          mediaType: photo.mediaType ?? "image",
                        }}
                      />
                    ) : <span />}
                  </div>
                  <div className="admin-photo-meta">
                    <strong>{formatMonthYear(photo.captured_at ?? photo.created_at)}</strong>
                    <span>{photo.caption || "Gallery item"}</span>
                  </div>
                  <div className="admin-photo-controls">
                    <label className="storybook-field">
                      <span>Visibility</span>
                      <select
                        value={String(photo.is_visible)}
                        onChange={(eventField) =>
                          void onPhotoChange(photo.id, { is_visible: eventField.target.value === "true" })
                        }
                      >
                        <option value="true">Visible</option>
                        <option value="false">Hidden</option>
                      </select>
                    </label>
                    <label className="storybook-field">
                      <span>Timeline chapter</span>
                      <select
                        value={photo.timeline_section_id || ""}
                        onChange={(eventField) =>
                          void onPhotoChange(photo.id, { timeline_section_id: eventField.target.value || null })
                        }
                      >
                        <option value="">Gallery only</option>
                        {sections.map((section) => (
                          <option key={section.id} value={section.id}>
                            {section.label} · {section.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="storybook-field">
                      <span>Featured order</span>
                      <input
                        min={0}
                        type="number"
                        value={photo.timeline_sort_order}
                        onChange={(eventField) =>
                          void onPhotoChange(photo.id, {
                            timeline_sort_order: Number(eventField.target.value) || 0,
                          })
                        }
                      />
                    </label>
                    <button className="storybook-button storybook-button-danger" onClick={() => void onPhotoDelete(photo)} type="button">
                      Delete photo
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </>
      ) : (
        <article className="storybook-card empty-card">
          <h2>Open an event to start curating</h2>
          <p className="storybook-copy">
            Enter the event code for the birthday album you want to manage. Only owner/admin members can load it.
          </p>
          <p className={`inline-notice inline-notice-${notice.tone}`}>{notice.message}</p>
        </article>
      )}
    </section>
  );
}

function LegacyPage() {
  return (
    <section className="storybook-section">
      <article className="storybook-card empty-card">
        <h2>This route is no longer part of the main experience</h2>
        <p className="storybook-copy">
          The site now focuses on four pages only: Story Timeline, Gallery, Upload, and Admin.
        </p>
      </article>
    </section>
  );
}

function ModeratorPage({
  eventCode,
  moderatorPin,
  event,
  settings,
  sections,
  notice,
  busy,
  photos,
  deleteBusyId,
  settingsBusy,
  uploadBusySectionId,
  draftUploads,
  onEventCodeChange,
  onPinChange,
  onOpen,
  onSettingsChange,
  onSyncSections,
  onSectionChange,
  onSectionReorder,
  onPhotoChange,
  onSectionFilesSelected,
  onRemoveDraft,
  onUploadToSection,
  onDelete,
}: {
  eventCode: string;
  moderatorPin: string;
  event: EventRecord | null;
  settings: StorySettingsRecord | null;
  sections: StorySectionRecord[];
  notice: Notice;
  busy: boolean;
  photos: ModeratorPhoto[];
  deleteBusyId: string | null;
  settingsBusy: boolean;
  uploadBusySectionId: string | null;
  draftUploads: Record<string, UploadPreview[]>;
  onEventCodeChange: (value: string) => void;
  onPinChange: (value: string) => void;
  onOpen: (event: FormEvent<HTMLFormElement>) => void;
  onSettingsChange: (updates: Partial<StorySettingsRecord>) => void;
  onSyncSections: () => void;
  onSectionChange: (sectionId: string, updates: Partial<StorySectionRecord>) => void;
  onSectionReorder: (sectionId: string, direction: -1 | 1) => void;
  onPhotoChange: (photoId: string, updates: Partial<PhotoRecord>) => void;
  onSectionFilesSelected: (sectionId: string, event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveDraft: (sectionId: string, previewId: string) => void;
  onUploadToSection: (sectionId: string) => void;
  onDelete: (photoId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "photos" | "chapters" | "settings">("overview");
  const photosBySection = useMemo(
    () =>
      sections.map((section) => ({
        id: section.id,
        items: photos
          .filter((photo) => photo.timelineSectionId === section.id)
          .sort((left, right) => left.timelineSortOrder - right.timelineSortOrder),
      })),
    [photos, sections],
  );
  const visibleSections = sections.filter((section) => section.visible).length;
  const approvedPhotos = photos.filter((photo) => photo.status === "approved").length;
  const hiddenPhotos = photos.filter((photo) => !photo.isVisible).length;
  const pendingPhotos = photos.filter((photo) => photo.status === "pending").length;
  const workspaceReady = Boolean(event && settings);
  const activeEvent = event;
  const activeSettings = settings;

  return (
    <section className="storybook-section">
      {!workspaceReady ? (
        <article className="moderator-entry-shell">
          <div className="moderator-dashboard-header">
            <div className="moderator-dashboard-brand">
              <div className="moderator-dashboard-mark" aria-hidden="true">
                <span />
              </div>
              <div>
                <h2>Moderator Dashboard</h2>
                <p>Manage Vaayu&apos;s storybook</p>
              </div>
            </div>
            <div className="moderator-dashboard-star" aria-hidden="true">✦</div>
          </div>
          <form className="moderator-entry-form" onSubmit={onOpen}>
            <label className="storybook-field">
              <span>Event code</span>
              <input value={eventCode} onChange={(event) => onEventCodeChange(event.target.value.toUpperCase())} />
            </label>
            <label className="storybook-field">
              <span>Moderator PIN</span>
              <input
                autoComplete="off"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]*"
                type="tel"
                value={moderatorPin}
                onChange={(event) => onPinChange(normalizePin(event.target.value))}
                onKeyDown={preventEnterSubmit}
              />
            </label>
            <button className="storybook-button storybook-button-primary" disabled={busy} type="submit">
              {busy ? "Opening..." : "Open manager"}
            </button>
          </form>
          <p className="storybook-copy moderator-entry-copy">
            Use the separate moderator PIN to manage Vaayu&apos;s monthly timeline, upload chapter photos, and clean up the gallery without signing in.
          </p>
          <p className="storybook-copy moderator-entry-copy moderator-entry-note">
            Guest story, gallery, and upload use the guest PIN. The moderator PIN only works on this manager page.
          </p>
          <p className={`inline-notice inline-notice-${notice.tone}`}>{notice.message}</p>
        </article>
      ) : null}

      {workspaceReady && activeEvent && activeSettings ? (
        <>
          <div className="moderator-dashboard-shell">
            <div className="moderator-dashboard-header">
              <div className="moderator-dashboard-brand">
                <div className="moderator-dashboard-mark" aria-hidden="true">
                  <span />
                </div>
                <div>
                  <h2>Moderator Dashboard</h2>
                  <p>Manage Vaayu&apos;s storybook</p>
                </div>
              </div>
              <div className="moderator-dashboard-star" aria-hidden="true">✦</div>
            </div>

            <div className="moderator-tabs">
              {[
                { key: "overview", label: "Overview" },
                { key: "photos", label: "Photos" },
                { key: "chapters", label: "Chapters" },
                { key: "settings", label: "Settings" },
              ].map((tab) => (
                <button
                  className={`moderator-tab ${activeTab === tab.key ? "moderator-tab-active" : ""}`}
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as "overview" | "photos" | "chapters" | "settings")}
                  type="button"
                >
                  {tab.label}
                  {tab.key === "photos" && pendingPhotos > 0 ? (
                    <span className="moderator-tab-badge">{pendingPhotos}</span>
                  ) : null}
                </button>
              ))}
            </div>

            {activeTab === "overview" ? (
              <div className="moderator-overview-grid">
                {[
                  { label: "Visible Chapters", value: `${visibleSections}/${sections.length}` },
                  { label: "Total Photos", value: String(photos.length) },
                  { label: "Pending Review", value: String(pendingPhotos) },
                  { label: "Approved", value: String(approvedPhotos) },
                ].map((stat) => (
                  <article className="moderator-stat-card" key={stat.label}>
                    <p className="moderator-stat-value">{stat.value}</p>
                    <p className="moderator-stat-label">{stat.label}</p>
                  </article>
                ))}

                <article className="moderator-summary-card">
                  <h3>Story Details</h3>
                  <div className="moderator-summary-grid">
                    <div>
                      <span>Baby</span>
                      <strong>{activeEvent.title}</strong>
                    </div>
                    <div>
                      <span>Tagline</span>
                      <strong>{activeSettings.cover_subtitle}</strong>
                    </div>
                    <div>
                      <span>Timeline</span>
                      <strong>{activeSettings.grouping === "month" ? "Monthly" : "Yearly"}</strong>
                    </div>
                    <div>
                      <span>Birth Date</span>
                      <strong>{activeSettings.birth_date || getDefaultBirthDate(activeEvent.public_code) || "Not set"}</strong>
                    </div>
                  </div>
                </article>

                <article className="moderator-summary-card">
                  <h3>Photo Status</h3>
                  <div className="moderator-status-list">
                    <div className="moderator-status-pill">
                      <span>Pending Review</span>
                      <strong>{pendingPhotos}</strong>
                    </div>
                    <div className="moderator-status-pill">
                      <span>Approved</span>
                      <strong>{approvedPhotos}</strong>
                    </div>
                    <div className="moderator-status-pill">
                      <span>Hidden Photos</span>
                      <strong>{hiddenPhotos}</strong>
                    </div>
                  </div>
                </article>
              </div>
            ) : null}

            {activeTab === "photos" ? (
              <div className="admin-photo-grid moderator-photo-grid">
                {photos.map((photo) => (
                  <article className="admin-photo-card moderator-photo-card" key={photo.id}>
                    <div className="admin-photo-frame">
                      {photo.imageUrl ? <MediaFrame photo={photo} /> : <span />}
                      {!photo.isVisible ? <div className="moderator-photo-hidden">Hidden</div> : null}
                      {photo.status === "pending" ? <div className="moderator-photo-pending">Pending</div> : null}
                    </div>
                    <div className="admin-photo-meta">
                      <strong>{formatMonthYear(photo.capturedAt)}</strong>
                      <span>{photo.title}</span>
                    </div>
                    <div className="admin-photo-controls">
                      <label className="storybook-field">
                        <span>Visibility</span>
                        <select
                          value={String(photo.isVisible)}
                          onChange={(eventField) =>
                            onPhotoChange(photo.id, { is_visible: eventField.target.value === "true" })
                          }
                        >
                          <option value="true">Visible</option>
                          <option value="false">Hidden</option>
                        </select>
                      </label>
                      <label className="storybook-field">
                        <span>Timeline chapter</span>
                        <select
                          value={photo.timelineSectionId || ""}
                          onChange={(eventField) =>
                            onPhotoChange(photo.id, { timeline_section_id: eventField.target.value || null })
                          }
                        >
                          <option value="">Gallery only</option>
                          {sections.map((section) => (
                            <option key={section.id} value={section.id}>
                              {section.label} · {section.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="storybook-field">
                        <span>Featured order</span>
                        <input
                          min={0}
                          type="number"
                          value={photo.timelineSortOrder}
                          onChange={(eventField) =>
                            onPhotoChange(photo.id, { timeline_sort_order: Number(eventField.target.value) || 0 })
                          }
                        />
                      </label>
                      <button
                        className="storybook-button storybook-button-danger"
                        disabled={deleteBusyId === photo.id}
                        onClick={() => onDelete(photo.id)}
                        type="button"
                      >
                        {deleteBusyId === photo.id ? "Deleting..." : "Delete photo"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {activeTab === "chapters" ? (
              <div className="moderator-chapter-stack">
                {sections.map((section) => (
                  <article className="admin-section-card moderator-section-card" key={section.id}>
                    <div className="moderator-chapter-head">
                      <div className="moderator-chapter-reorder">
                        <button onClick={() => onSectionReorder(section.id, -1)} type="button">
                          ↑
                        </button>
                        <button onClick={() => onSectionReorder(section.id, 1)} type="button">
                          ↓
                        </button>
                      </div>
                      <span className="moderator-chapter-emoji">{chapterEmojis[(section.sort_order - 1 + chapterEmojis.length) % chapterEmojis.length]}</span>
                      <div className="moderator-chapter-title">
                        <p>{section.label}</p>
                        <strong>{section.title}</strong>
                        {section.subtitle ? <span>{section.subtitle}</span> : null}
                      </div>
                      <div className="moderator-chapter-actions">
                        <button onClick={() => onSectionChange(section.id, { visible: !section.visible })} type="button">
                          {section.visible ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>

                    <div className="settings-grid">
                      <label className="storybook-field">
                        <span>Label</span>
                        <input
                          value={section.label}
                          onChange={(eventField) => onSectionChange(section.id, { label: eventField.target.value })}
                        />
                      </label>
                      <label className="storybook-field">
                        <span>Title</span>
                        <input
                          value={section.title}
                          onChange={(eventField) => onSectionChange(section.id, { title: eventField.target.value })}
                        />
                      </label>
                      <label className="storybook-field">
                        <span>Subtitle</span>
                        <input
                          value={section.subtitle || ""}
                          onChange={(eventField) => onSectionChange(section.id, { subtitle: eventField.target.value })}
                        />
                      </label>
                    </div>

                    <label className="storybook-field">
                      <span>Story text</span>
                      <textarea
                        rows={3}
                        value={section.story_text || ""}
                        onChange={(eventField) => onSectionChange(section.id, { story_text: eventField.target.value })}
                      />
                    </label>

                    <div className="moderator-polaroid-row">
                      {(photosBySection.find((item) => item.id === section.id)?.items || []).map((photo) => (
                        <article className="moderator-polaroid" key={photo.id}>
                          <div className="moderator-polaroid-frame">
                            {photo.imageUrl ? <MediaFrame photo={photo} /> : <span />}
                          </div>
                          <div className="moderator-polaroid-meta">
                            <strong>{formatMonthYear(photo.capturedAt)}</strong>
                            <label className="storybook-field">
                              <span>Order</span>
                              <input
                                min={0}
                                type="number"
                                value={photo.timelineSortOrder}
                                onChange={(eventField) =>
                                  onPhotoChange(photo.id, {
                                    timeline_sort_order: Number(eventField.target.value) || 0,
                                  })
                                }
                              />
                            </label>
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="moderator-upload-composer">
                      <label className="upload-dropzone moderator-upload-dropzone">
                        <input accept="image/*,video/*" multiple onChange={(eventField) => onSectionFilesSelected(section.id, eventField)} type="file" />
                        <span>Upload chapter media</span>
                        <small>Photos and videos added here can appear as printed keepsakes in the timeline.</small>
                      </label>

                      {(draftUploads[section.id] || []).length > 0 ? (
                        <div className="upload-preview-grid moderator-preview-grid">
                          {(draftUploads[section.id] || []).map((preview) => (
                            <article className="upload-preview-card" key={preview.id}>
                              <MediaFrame
                                alt={preview.file.name}
                                autoPlay={preview.mediaType === "video"}
                                loop={preview.mediaType === "video"}
                                photo={{
                                  title: preview.file.name,
                                  imageUrl: preview.url,
                                  fullImageUrl: preview.url,
                                  mediaType: preview.mediaType,
                                }}
                              />
                              <div>
                                <strong>{preview.file.name}</strong>
                                <span>{formatMonthYear(preview.capturedAt)}</span>
                              </div>
                              <button
                                className="upload-preview-remove"
                                onClick={() => onRemoveDraft(section.id, preview.id)}
                                type="button"
                              >
                                Remove
                              </button>
                            </article>
                          ))}
                        </div>
                      ) : null}

                      <button
                        className="storybook-button storybook-button-primary"
                        disabled={uploadBusySectionId === section.id || (draftUploads[section.id] || []).length === 0}
                        onClick={() => onUploadToSection(section.id)}
                        type="button"
                      >
                        {uploadBusySectionId === section.id ? "Uploading..." : "Upload to this chapter"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {activeTab === "settings" ? (
              <article className="moderator-settings-panel">
                <div className="settings-grid">
                  <label className="storybook-field">
                    <span>Birth date</span>
                    <input
                      type="date"
                      value={settings.birth_date || getDefaultBirthDate(event.public_code) || ""}
                      onChange={(eventField) => onSettingsChange({ birth_date: eventField.target.value || null })}
                    />
                  </label>
                  <label className="storybook-field">
                    <span>Grouping</span>
                    <select
                      value={settings.grouping}
                      onChange={(eventField) =>
                        onSettingsChange({ grouping: eventField.target.value as "month" | "year" })
                      }
                    >
                      <option value="month">Month</option>
                      <option value="year">Year</option>
                    </select>
                  </label>
                  <label className="storybook-field">
                    <span>Section count</span>
                    <input
                      max={24}
                      min={1}
                      type="number"
                      value={settings.section_count}
                      onChange={(eventField) =>
                        onSettingsChange({ section_count: Number(eventField.target.value) || 12 })
                      }
                    />
                  </label>
                  <label className="storybook-field">
                    <span>Cover title</span>
                    <input
                      value={settings.cover_title}
                      onChange={(eventField) => onSettingsChange({ cover_title: eventField.target.value })}
                    />
                  </label>
                  <label className="storybook-field">
                    <span>Cover subtitle</span>
                    <input
                      value={settings.cover_subtitle}
                      onChange={(eventField) => onSettingsChange({ cover_subtitle: eventField.target.value })}
                    />
                  </label>
                </div>

                <button
                  className="storybook-button storybook-button-secondary"
                  disabled={settingsBusy}
                  onClick={onSyncSections}
                  type="button"
                >
                  {settingsBusy ? "Syncing..." : "Sync 12 monthly chapters"}
                </button>
              </article>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function StorybookShell({
  children,
  guestHref,
  currentScreen,
  adminVisible,
}: {
  children: ReactNode;
  guestHref: (path: string) => string;
  currentScreen: ScreenKey;
  adminVisible: boolean;
}) {
  const tabs = [
    { key: "gallery", href: guestHref("/gallery"), label: "Gallery", icon: "gallery" },
    { key: "upload", href: guestHref("/upload"), label: "Upload", icon: "upload" },
  ] as const;

  return (
    <main className="storybook-app-shell">
      <div className="storybook-global-decor" aria-hidden="true">
        <OrbitSunEarth className="storybook-orbit storybook-orbit-global" />
        <OrbitSunEarth className="storybook-orbit storybook-orbit-global-secondary" />
        <MoonStars className="storybook-moon-stars storybook-moon-stars-global" />
        <MoonStars className="storybook-moon-stars storybook-moon-stars-global-secondary" />
        {currentScreen === "timeline" ? (
          <>
            <OrbitSunEarth className="storybook-orbit storybook-orbit-story-a" />
            <OrbitSunEarth className="storybook-orbit storybook-orbit-story-b" />
            <OrbitSunEarth className="storybook-orbit storybook-orbit-story-c" />
            <MoonStars className="storybook-moon-stars storybook-moon-stars-story-a" />
            <MoonStars className="storybook-moon-stars storybook-moon-stars-story-b" />
          </>
        ) : null}
      </div>
      <header className="storybook-header">
        <Link className="storybook-brand" href={guestHref("/gallery")}>
          <BrandSunMark />
          <span className="storybook-brand-copy">
            <strong>Vaayu</strong>
            <small>His First Year</small>
          </span>
        </Link>
        <nav className="storybook-nav" aria-label="Primary">
          {tabs.map((tab) => {
            return (
              <Link
                className={`storybook-tab ${currentScreen === tab.key ? "storybook-tab-active" : ""}`}
                href={tab.href}
                key={tab.key}
              >
                <HeaderIcon kind={tab.icon} />
                <span className="storybook-tab-label">{tab.label}</span>
              </Link>
            );
          })}
          {adminVisible ? (
            <Link
              className={`storybook-admin-link ${currentScreen === "moderator" ? "storybook-admin-link-active" : ""}`}
              href="/moderator"
              title="Moderator"
            >
              <HeaderIcon kind="settings" />
            </Link>
          ) : null}
        </nav>
      </header>

      {children}
    </main>
  );
}

export function BirthdayApp({ initialGuestAccess }: BirthdayAppProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentScreen = getScreen(pathname);

  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<Notice>({
    tone: hasSupabaseClientEnv ? "neutral" : "error",
    message: hasSupabaseClientEnv
      ? "Using the Supabase-backed storybook experience."
      : "Public Supabase env vars are missing. Showing storyboard demo mode.",
  });
  const [guestAccess, setGuestAccess] = useState<GuestAccess>(
    initialGuestAccess || { eventCode: "", pin: "" },
  );
  const [timelineEvent, setTimelineEvent] = useState<EventRecord | null>(
    hasSupabaseClientEnv ? null : demoStoryEvent,
  );
  const [storySettings, setStorySettings] = useState<StorySettingsRecord | null>(
    hasSupabaseClientEnv ? null : demoStorySettings,
  );
  const [storySections, setStorySections] = useState<StorySectionCard[]>(
    hasSupabaseClientEnv ? [] : demoStorySections,
  );
  const [galleryPhotos, setGalleryPhotos] = useState<PhotoCard[]>(
    hasSupabaseClientEnv ? [] : demoGalleryPhotos,
  );
  const [guestLoading, setGuestLoading] = useState(false);
  const [uploadPreviews, setUploadPreviews] = useState<UploadPreview[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [adminEventCode, setAdminEventCode] = useState(initialGuestAccess?.eventCode || "");
  const [adminEvent, setAdminEvent] = useState<EventRecord | null>(null);
  const [adminSettings, setAdminSettings] = useState<StorySettingsRecord | null>(null);
  const [adminSections, setAdminSections] = useState<StorySectionRecord[]>([]);
  const [adminPhotos, setAdminPhotos] = useState<AdminPhoto[]>([]);
  const [moderatorPin, setModeratorPin] = useState("");
  const [moderatorBusy, setModeratorBusy] = useState(false);
  const [moderatorDeleteBusyId, setModeratorDeleteBusyId] = useState<string | null>(null);
  const [moderatorUploadBusySectionId, setModeratorUploadBusySectionId] = useState<string | null>(null);
  const [moderatorSettingsBusy, setModeratorSettingsBusy] = useState(false);
  const [moderatorEvent, setModeratorEvent] = useState<EventRecord | null>(null);
  const [moderatorSettings, setModeratorSettings] = useState<StorySettingsRecord | null>(null);
  const [moderatorSections, setModeratorSections] = useState<StorySectionRecord[]>([]);
  const [moderatorPhotos, setModeratorPhotos] = useState<ModeratorPhoto[]>([]);
  const [moderatorDraftUploads, setModeratorDraftUploads] = useState<Record<string, UploadPreview[]>>({});

  useEffect(() => {
    if (!hasSupabaseClientEnv) return;

    let mounted = true;
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const eventCode = searchParams.get("event");
    const pin = searchParams.get("pin");

    if (!eventCode && !pin) {
      setGuestAccess((current) =>
        current.eventCode || current.pin ? { eventCode: "", pin: "" } : current,
      );
      return;
    }

    const normalizedEventCode = (eventCode || "").toUpperCase();
    const normalizedPin = pin || "";

    setGuestAccess((current) =>
      current.eventCode === normalizedEventCode && current.pin === normalizedPin
        ? current
        : { eventCode: normalizedEventCode, pin: normalizedPin },
    );
    setAdminEventCode(normalizedEventCode);
  }, [searchParams]);

  useEffect(() => {
    return () => {
      uploadPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [uploadPreviews]);

  useEffect(() => {
    if (!hasSupabaseClientEnv) return;
    if (!guestAccess.eventCode || !guestAccess.pin) return;
    if (!["timeline", "gallery"].includes(currentScreen)) return;

    let active = true;

    async function loadGuestContent() {
      setGuestLoading(true);
      try {
        const [storyResponse, galleryResponse] = await Promise.all([
          fetch(`${functionsBaseUrl}/guest-story`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event_code: guestAccess.eventCode,
              pin: guestAccess.pin,
            }),
          }),
          fetch(`${functionsBaseUrl}/guest-gallery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event_code: guestAccess.eventCode,
              pin: guestAccess.pin,
            }),
          }),
        ]);

        const storyData = (await storyResponse.json()) as GuestStoryResponse & { error?: string };
        const galleryData = (await galleryResponse.json()) as GuestGalleryResponse & { error?: string };

        if (!storyResponse.ok) {
          throw new Error(storyData.error || "Unable to open the story timeline.");
        }
        if (!galleryResponse.ok) {
          throw new Error(galleryData.error || "Unable to open the gallery.");
        }

        if (!active) return;
        const nextSections = storyData.sections.map((section) => ({
          id: section.id,
          event_id: storyData.event.id,
          label: section.label,
          title: section.title,
          subtitle: section.subtitle,
          story_text: section.story_text,
          sort_order: section.sort_order,
          visible: section.visible,
          created_at: storyData.event.created_at,
          updated_at: storyData.event.created_at,
          photos: section.photos.map(buildPhotoCardFromGuest),
        }));
        const scaffold = resolveStoryScaffold(storyData.event, storyData.settings, nextSections);
        setTimelineEvent(storyData.event);
        setStorySettings(scaffold.settings);
        setStorySections(scaffold.sections);
        setGalleryPhotos(galleryData.photos.map(buildPhotoCardFromGuest));
        setNotice({
          tone: "success",
          message: `Loaded ${storyData.event.title} with capture-date grouping.`,
        });
      } catch (error) {
        if (!active) return;
        setStorySections([]);
        setGalleryPhotos([]);
        setNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "Unable to load this event.",
        });
      } finally {
        if (active) {
          setGuestLoading(false);
        }
      }
    }

    void loadGuestContent();

    return () => {
      active = false;
    };
  }, [currentScreen, guestAccess.eventCode, guestAccess.pin]);

  function guestHref(path: string) {
    if (!guestAccess.eventCode || !guestAccess.pin) return path;
    const params = new URLSearchParams({
      event: guestAccess.eventCode,
      pin: guestAccess.pin,
    });
    return `${path}?${params.toString()}`;
  }

  function openGuestPage(path: string) {
    router.push(guestHref(path));
  }

  async function handleAccessSubmit(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    if (!guestAccess.eventCode || !guestAccess.pin) {
      setNotice({ tone: "error", message: "Add the event code and PIN to continue." });
      return;
    }
    router.push(guestHref(currentScreen === "upload" ? "/upload" : "/gallery"));
  }

  async function handleUpload(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    if (!hasSupabaseClientEnv) {
      setNotice({ tone: "success", message: "Demo mode: upload UI updated, but no live backend is connected." });
      return;
    }
    if (!guestAccess.eventCode || !guestAccess.pin || uploadPreviews.length === 0) {
      setNotice({ tone: "error", message: "Add the event code, PIN, and at least one file." });
      return;
    }

    setUploadBusy(true);

    try {
      for (const preview of uploadPreviews) {
        const extension = getFileExtension(preview.file);
        const response = await fetch(`${functionsBaseUrl}/guest-upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_code: guestAccess.eventCode,
            pin: guestAccess.pin,
            file_ext: extension,
            captured_at: preview.capturedAt,
          }),
        });

        const data = (await response.json()) as GuestUploadResponse & { error?: string };
        if (!response.ok) {
          throw new Error(data.error || "Unable to create the upload slot.");
        }

        const uploadResponse = await fetch(data.signed_url, {
          method: "PUT",
          body: preview.file,
          headers: {
            "Content-Type": preview.file.type || "application/octet-stream",
            "x-upsert": "false",
          },
        });

        if (!uploadResponse.ok) {
          throw new Error("The photo upload did not complete.");
        }
      }

      setUploadPreviews([]);
      setNotice({ tone: "success", message: "Media uploaded. Returning to the gallery." });
      router.push(guestHref("/gallery"));
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "The upload failed.",
      });
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files || []);
    if (nextFiles.length === 0) return;

    const nextPreviews = await Promise.all(
      nextFiles.map(async (file, index) => {
        const { capturedAt } = await extractCaptureDate(file);
        return {
          id: `${file.name}-${file.lastModified}-${index}`,
          file,
          url: URL.createObjectURL(file),
          capturedAt,
          mediaType: getMediaTypeFromFile(file),
        };
      }),
    );

    setUploadPreviews((current) => [...current, ...nextPreviews]);
    event.target.value = "";
  }

  function removeUploadPreview(previewId: string) {
    setUploadPreviews((current) => {
      const match = current.find((preview) => preview.id === previewId);
      if (match) URL.revokeObjectURL(match.url);
      return current.filter((preview) => preview.id !== previewId);
    });
  }

  async function handleAuth(mode: "signin" | "signup") {
    if (!hasSupabaseClientEnv) {
      setNotice({ tone: "error", message: "Supabase env vars are required for admin sign-in." });
      return;
    }
    setAuthBusy(true);
    try {
      const supabase = getSupabaseClient();
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName || email } },
        });
        if (error) throw error;
        setNotice({ tone: "success", message: "Account created. Sign in if you are not redirected automatically." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setNotice({ tone: "success", message: "Signed in. Open the event to manage it." });
      }
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Authentication failed." });
    } finally {
      setAuthBusy(false);
    }
  }

  function applyModeratorWorkspace(data: ModeratorStoryResponse) {
    setModeratorEvent(data.event);
    setModeratorSettings(data.settings);
    setModeratorSections(
      data.sections.map((section) => ({
        id: section.id,
        event_id: data.event.id,
        label: section.label,
        title: section.title,
        subtitle: section.subtitle,
        story_text: section.story_text,
        sort_order: section.sort_order,
        visible: section.visible,
        created_at: data.event.created_at,
        updated_at: data.event.created_at,
      })),
    );
    setModeratorPhotos(data.photos.map(mapModeratorPhoto));
    const scaffold = resolveStoryScaffold(data.event, data.settings, buildStorySectionsFromModerator(data));
    setTimelineEvent(data.event);
    setStorySettings(scaffold.settings);
    setStorySections(scaffold.sections);
    setGalleryPhotos(buildGalleryPhotosFromModerator(data));
  }

  async function requestModeratorWorkspace(
    action:
      | { action?: "open" }
      | {
          action: "update_settings";
          settings: Partial<StorySettingsRecord>;
        }
      | {
          action: "sync_sections";
        }
      | {
          action: "update_section";
          section_id: string;
          section: Partial<StorySectionRecord>;
        }
      | {
          action: "reorder_section";
          section_id: string;
          direction: -1 | 1;
        }
      | {
          action: "update_photo";
          photo_id: string;
          photo: Partial<PhotoRecord>;
        },
  ) {
    const response = await fetch(`${functionsBaseUrl}/moderator-story`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_code: adminEventCode.trim().toUpperCase(),
        moderator_pin: moderatorPin.trim(),
        ...action,
      }),
    });
    const data = (await response.json()) as ModeratorStoryResponse & { error?: string };
    if (!response.ok) {
      throw new Error(data.error || "Unable to update moderator workspace.");
    }
    applyModeratorWorkspace(data);
    return data;
  }

  async function handleModeratorOpen(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    if (!hasSupabaseClientEnv) {
      setNotice({ tone: "error", message: "Supabase env vars are required for moderator access." });
      return;
    }
    if (!adminEventCode || !moderatorPin) {
      setNotice({ tone: "error", message: "Enter the event code and moderator PIN." });
      return;
    }

    setModeratorBusy(true);
    try {
      const data = await requestModeratorWorkspace({ action: "open" });
      setNotice({ tone: "success", message: `Loaded ${data.sections.length} monthly chapters for moderation.` });
    } catch (error) {
      setModeratorEvent(null);
      setModeratorSettings(null);
      setModeratorSections([]);
      setModeratorPhotos([]);
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Moderator access failed." });
    } finally {
      setModeratorBusy(false);
    }
  }

  async function handleModeratorDelete(photoId: string) {
    if (!hasSupabaseClientEnv) return;
    setModeratorDeleteBusyId(photoId);
    try {
      const response = await fetch(`${functionsBaseUrl}/moderator-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_code: adminEventCode.trim().toUpperCase(),
          moderator_pin: moderatorPin.trim(),
          photo_id: photoId,
        }),
      });
      const data = (await response.json()) as ModeratorDeleteResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Unable to delete photo.");
      }
      await requestModeratorWorkspace({ action: "open" });
      setNotice({ tone: "success", message: "Photo deleted." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Delete failed." });
    } finally {
      setModeratorDeleteBusyId(null);
    }
  }

  async function handleModeratorSettingsChange(updates: Partial<StorySettingsRecord>) {
    if (!hasSupabaseClientEnv) return;
    setModeratorSettingsBusy(true);
    try {
      await requestModeratorWorkspace({ action: "update_settings", settings: updates });
      setNotice({ tone: "success", message: "Timeline settings updated." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Settings update failed." });
    } finally {
      setModeratorSettingsBusy(false);
    }
  }

  async function handleModeratorSyncSections() {
    if (!hasSupabaseClientEnv) return;
    setModeratorSettingsBusy(true);
    try {
      await requestModeratorWorkspace({ action: "sync_sections" });
      setNotice({ tone: "success", message: "Monthly timeline sections synced." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to sync sections." });
    } finally {
      setModeratorSettingsBusy(false);
    }
  }

  async function handleModeratorSectionChange(sectionId: string, updates: Partial<StorySectionRecord>) {
    if (!hasSupabaseClientEnv) return;
    try {
      await requestModeratorWorkspace({
        action: "update_section",
        section_id: sectionId,
        section: updates,
      });
      setNotice({ tone: "success", message: "Timeline section updated." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to update section." });
    }
  }

  async function handleModeratorSectionReorder(sectionId: string, direction: -1 | 1) {
    if (!hasSupabaseClientEnv) return;
    try {
      await requestModeratorWorkspace({ action: "reorder_section", section_id: sectionId, direction });
      setNotice({ tone: "success", message: "Timeline section reordered." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to reorder section." });
    }
  }

  async function handleModeratorPhotoChange(photoId: string, updates: Partial<PhotoRecord>) {
    if (!hasSupabaseClientEnv) return;
    try {
      await requestModeratorWorkspace({ action: "update_photo", photo_id: photoId, photo: updates });
      setNotice({ tone: "success", message: "Photo updated." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to update photo." });
    }
  }

  async function handleModeratorFilesSelected(sectionId: string, event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files || []);
    if (nextFiles.length === 0) return;

    const nextPreviews = await Promise.all(
      nextFiles.map(async (file, index) => {
        const { capturedAt } = await extractCaptureDate(file);
        return {
          id: `${sectionId}-${file.name}-${file.lastModified}-${index}`,
          file,
          url: URL.createObjectURL(file),
          capturedAt,
          mediaType: getMediaTypeFromFile(file),
        };
      }),
    );

    setModeratorDraftUploads((current) => ({
      ...current,
      [sectionId]: [...(current[sectionId] || []), ...nextPreviews],
    }));
    event.target.value = "";
  }

  function removeModeratorDraft(sectionId: string, previewId: string) {
    setModeratorDraftUploads((current) => {
      const existing = current[sectionId] || [];
      const match = existing.find((preview) => preview.id === previewId);
      if (match) {
        URL.revokeObjectURL(match.url);
      }
      return {
        ...current,
        [sectionId]: existing.filter((preview) => preview.id !== previewId),
      };
    });
  }

  async function handleModeratorUpload(sectionId: string) {
    if (!hasSupabaseClientEnv) return;
    const previews = moderatorDraftUploads[sectionId] || [];
    if (previews.length === 0) {
      setNotice({ tone: "error", message: "Choose one or more files for this month first." });
      return;
    }

    setModeratorUploadBusySectionId(sectionId);
    try {
      const sectionPhotos = moderatorPhotos.filter((photo) => photo.timelineSectionId === sectionId);
      let sortBase = sectionPhotos.length;

      for (const preview of previews) {
        const extension = getFileExtension(preview.file);
        const response = await fetch(`${functionsBaseUrl}/moderator-upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_code: adminEventCode.trim().toUpperCase(),
            moderator_pin: moderatorPin.trim(),
            file_ext: extension,
            captured_at: preview.capturedAt,
            timeline_section_id: sectionId,
            timeline_sort_order: sortBase,
          }),
        });

        const data = (await response.json()) as ModeratorUploadResponse & { error?: string };
        if (!response.ok) {
          throw new Error(data.error || "Unable to create the upload slot.");
        }

        const uploadResponse = await fetch(data.signed_url, {
          method: "PUT",
          body: preview.file,
          headers: {
            "Content-Type": preview.file.type || "application/octet-stream",
            "x-upsert": "false",
          },
        });

        if (!uploadResponse.ok) {
          throw new Error("The moderator upload did not complete.");
        }

        sortBase += 1;
      }

      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
      setModeratorDraftUploads((current) => ({ ...current, [sectionId]: [] }));
      await requestModeratorWorkspace({ action: "open" });
      setNotice({ tone: "success", message: "Timeline media uploaded." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to upload chapter photos." });
    } finally {
      setModeratorUploadBusySectionId(null);
    }
  }

  const loadAdminWorkspace = useCallback(async (eventCodeOverride?: string) => {
    if (!hasSupabaseClientEnv || !session?.user) return;

    const eventCode = (eventCodeOverride || adminEventCode).trim().toUpperCase();
    if (!eventCode) {
      setNotice({ tone: "error", message: "Enter an event code to open the admin workspace." });
      return;
    }

    setAdminBusy(true);
    try {
      const supabase = getSupabaseClient();
      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .select("id, title, public_code, moderation_required, created_at")
        .eq("public_code", eventCode)
        .maybeSingle();
      if (eventError || !eventData) {
        throw new Error(eventError?.message || "Event not found.");
      }

      const { data: memberData, error: memberError } = await supabase
        .from("event_members")
        .select("role")
        .eq("event_id", eventData.id)
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (memberError || !memberData || !["owner", "admin"].includes(memberData.role)) {
        throw new Error("Only hosts and admins can manage this event.");
      }

      const [photoResult, settingsResult, sectionResult] = await Promise.all([
        supabase
          .from("photos")
          .select(
            "id, event_id, uploader_user_id, uploader_display_name, storage_path, caption, status, is_visible, captured_at, capture_source, timeline_section_id, timeline_sort_order, created_at",
          )
          .eq("event_id", eventData.id)
          .order("captured_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("event_story_settings")
          .select("event_id, grouping, section_count, birth_date, cover_title, cover_subtitle, updated_at")
          .eq("event_id", eventData.id)
          .maybeSingle(),
        supabase
          .from("event_story_sections")
          .select("id, event_id, label, title, subtitle, story_text, sort_order, visible, created_at, updated_at")
          .eq("event_id", eventData.id)
          .order("sort_order", { ascending: true }),
      ]);

      if (photoResult.error) throw new Error(photoResult.error.message);
      if (settingsResult.error) throw new Error(settingsResult.error.message);
      if (sectionResult.error) throw new Error(sectionResult.error.message);

      const photoRows = photoResult.data || [];
      const imageUrlMap = await createSignedViewUrls(photoRows.map((photo) => photo.storage_path));

      setAdminEvent(eventData);
      setAdminSettings(
        settingsResult.data || {
          event_id: eventData.id,
          grouping: "month",
          section_count: 12,
          birth_date: getDefaultBirthDate(eventData.public_code),
          cover_title: `${eventData.title} Timeline`,
          cover_subtitle: "A chapter-based scrapbook curated by the family.",
          updated_at: eventData.created_at,
        },
      );
      setAdminSections(sectionResult.data || []);
      setAdminPhotos(
        photoRows.map((photo) => ({
          ...photo,
          imageUrl: imageUrlMap.get(photo.storage_path) ?? null,
          mediaType: getMediaTypeFromExtension(photo.storage_path.split(".").pop() || ""),
        })),
      );
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storedEventIdKey, eventData.id);
      }
      setNotice({ tone: "success", message: `Opened admin workspace for ${eventData.title}.` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Failed to open admin." });
    } finally {
      setAdminBusy(false);
    }
  }, [adminEventCode, session?.user]);

  useEffect(() => {
    if (currentScreen !== "admin" || !session?.user || !adminEventCode || adminEvent) {
      return;
    }
    void loadAdminWorkspace(adminEventCode);
  }, [adminEvent, adminEventCode, currentScreen, loadAdminWorkspace, session?.user]);

  async function handleAdminLoad(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    await loadAdminWorkspace();
  }

  async function upsertAdminSettings(updates: Partial<StorySettingsRecord>) {
    if (!hasSupabaseClientEnv || !adminEvent) return;
    const supabase = getSupabaseClient();
    const payload = {
      event_id: adminEvent.id,
      grouping: updates.grouping ?? adminSettings?.grouping ?? "month",
      section_count: updates.section_count ?? adminSettings?.section_count ?? 12,
      birth_date: updates.birth_date ?? adminSettings?.birth_date ?? getDefaultBirthDate(adminEvent.public_code),
      cover_title: updates.cover_title ?? adminSettings?.cover_title ?? `${adminEvent.title} Timeline`,
      cover_subtitle:
        updates.cover_subtitle ??
        adminSettings?.cover_subtitle ??
        "A chapter-based scrapbook curated by the family.",
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("event_story_settings")
      .upsert(payload, { onConflict: "event_id" })
      .select("event_id, grouping, section_count, birth_date, cover_title, cover_subtitle, updated_at")
      .single();

    if (error) {
      setNotice({ tone: "error", message: error.message });
      return;
    }

    setAdminSettings(data);
    setNotice({ tone: "success", message: "Story settings updated." });
  }

  async function syncSectionCount() {
    if (!hasSupabaseClientEnv || !adminEvent) return;
    const supabase = getSupabaseClient();
    const grouping = adminSettings?.grouping || "month";
    const targetCount = adminSettings?.section_count || 12;
    const birthDate = adminSettings?.birth_date ?? getDefaultBirthDate(adminEvent.public_code);
    const existing = [...adminSections].sort((left, right) => left.sort_order - right.sort_order);

    const inserts = [];
    for (let index = existing.length; index < targetCount; index += 1) {
      inserts.push({
        event_id: adminEvent.id,
        ...buildDefaultSectionSeed(index, grouping, birthDate),
      });
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from("event_story_sections").insert(inserts);
      if (error) {
        setNotice({ tone: "error", message: error.message });
        return;
      }
    }

    if (existing.length > targetCount) {
      const hiddenIds = existing.slice(targetCount).map((section) => section.id);
      const { error } = await supabase
        .from("event_story_sections")
        .update({ visible: false, updated_at: new Date().toISOString() })
        .in("id", hiddenIds);
      if (error) {
        setNotice({ tone: "error", message: error.message });
        return;
      }
    }

    await loadAdminWorkspace(adminEvent.public_code);
  }

  async function updateAdminSection(sectionId: string, updates: Partial<StorySectionRecord>) {
    if (!hasSupabaseClientEnv || !adminEvent) return;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("event_story_sections")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", sectionId)
      .select("id, event_id, label, title, subtitle, story_text, sort_order, visible, created_at, updated_at")
      .single();
    if (error) {
      setNotice({ tone: "error", message: error.message });
      return;
    }
    setAdminSections((current) => current.map((section) => (section.id === sectionId ? data : section)));
  }

  async function reorderAdminSection(sectionId: string, direction: -1 | 1) {
    const ordered = [...adminSections].sort((left, right) => left.sort_order - right.sort_order);
    const index = ordered.findIndex((section) => section.id === sectionId);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return;
    const source = ordered[index];
    const target = ordered[swapIndex];
    await updateAdminSection(source.id, { sort_order: target.sort_order });
    await updateAdminSection(target.id, { sort_order: source.sort_order });
    await loadAdminWorkspace(adminEventCode);
  }

  async function updateAdminPhoto(photoId: string, updates: Partial<PhotoRecord>) {
    if (!hasSupabaseClientEnv) return;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("photos")
      .update(updates)
      .eq("id", photoId)
      .select(
        "id, event_id, uploader_user_id, uploader_display_name, storage_path, caption, status, is_visible, captured_at, capture_source, timeline_section_id, timeline_sort_order, created_at",
      )
      .single();
    if (error) {
      setNotice({ tone: "error", message: error.message });
      return;
    }
    setAdminPhotos((current) =>
      current.map((photo) =>
        photo.id === photoId ? { ...photo, ...data, imageUrl: photo.imageUrl, mediaType: photo.mediaType } : photo,
      ),
    );
  }

  async function deleteAdminPhoto(photo: AdminPhoto) {
    if (!hasSupabaseClientEnv) return;
    const supabase = getSupabaseClient();
    const storageDelete = await supabase.storage.from("event-photos").remove([photo.storage_path]);
    if (storageDelete.error) {
      setNotice({ tone: "error", message: storageDelete.error.message });
      return;
    }
    const { error } = await supabase.from("photos").delete().eq("id", photo.id);
    if (error) {
      setNotice({ tone: "error", message: error.message });
      return;
    }
    setAdminPhotos((current) => current.filter((item) => item.id !== photo.id));
    setNotice({ tone: "success", message: "Photo deleted." });
  }

  const needsGuestAccess =
    ["timeline", "gallery", "upload"].includes(currentScreen) &&
    hasSupabaseClientEnv &&
    (!guestAccess.eventCode || !guestAccess.pin);

  return (
    <StorybookShell
      adminVisible={Boolean(session)}
      currentScreen={currentScreen}
      guestHref={guestHref}
    >
      {needsGuestAccess ? (
        <AccessGate
          body="Enter the event code and PIN to open Vaayu's gallery or continue to photo upload."
          cta="Open the gallery"
          eventCode={guestAccess.eventCode}
          onEventCodeChange={(value) => setGuestAccess((current) => ({ ...current, eventCode: value }))}
          onPinChange={(value) => setGuestAccess((current) => ({ ...current, pin: value }))}
          onSubmit={handleAccessSubmit}
          pin={guestAccess.pin}
          title="Open Vaayu's gallery"
        />
      ) : null}

      {!needsGuestAccess && currentScreen === "timeline" ? (
        guestLoading ? (
          <StorybookLoading mode="timeline" />
        ) : (
          <StoryTimelinePage
            event={timelineEvent}
            onOpenGallery={() => openGuestPage("/gallery")}
            sections={storySections}
            settings={storySettings}
          />
        )
      ) : null}

      {!needsGuestAccess && currentScreen === "gallery" ? (
        guestLoading ? (
          <StorybookLoading mode="gallery" />
        ) : (
          <GalleryPage
            event={timelineEvent}
            onOpenUpload={() => openGuestPage("/upload")}
            photos={galleryPhotos}
          />
        )
      ) : null}

      {!needsGuestAccess && currentScreen === "upload" ? (
        <UploadPage
          busy={uploadBusy}
          eventCode={guestAccess.eventCode}
          notice={notice}
          onEventCodeChange={(value) => setGuestAccess((current) => ({ ...current, eventCode: value }))}
          onFilesSelected={handleFilesSelected}
          onPinChange={(value) => setGuestAccess((current) => ({ ...current, pin: value }))}
          onRemovePreview={removeUploadPreview}
          onSubmit={handleUpload}
          pin={guestAccess.pin}
          previews={uploadPreviews}
        />
      ) : null}

      {currentScreen === "admin" ? (
        <AdminPage
          adminBusy={adminBusy}
          adminEventCode={adminEventCode}
          authBusy={authBusy}
          email={email}
          event={adminEvent}
          fullName={fullName}
          notice={notice}
          onAdminEventCodeChange={setAdminEventCode}
          onAuth={handleAuth}
          onEmailChange={setEmail}
          onFullNameChange={setFullName}
          onLoadEvent={handleAdminLoad}
          onPasswordChange={setPassword}
          onPhotoChange={updateAdminPhoto}
          onPhotoDelete={deleteAdminPhoto}
          onSectionChange={updateAdminSection}
          onSectionReorder={reorderAdminSection}
          onSettingsChange={upsertAdminSettings}
          onSyncSectionCount={syncSectionCount}
          password={password}
          photos={adminPhotos}
          sections={adminSections}
          session={session}
          settings={adminSettings}
        />
      ) : null}

      {currentScreen === "moderator" ? (
        <ModeratorPage
          busy={moderatorBusy}
          deleteBusyId={moderatorDeleteBusyId}
          draftUploads={moderatorDraftUploads}
          event={moderatorEvent}
          eventCode={adminEventCode}
          moderatorPin={moderatorPin}
          notice={notice}
          onDelete={handleModeratorDelete}
          onEventCodeChange={setAdminEventCode}
          onOpen={handleModeratorOpen}
          onPinChange={setModeratorPin}
          onPhotoChange={handleModeratorPhotoChange}
          onRemoveDraft={removeModeratorDraft}
          onSectionChange={handleModeratorSectionChange}
          onSectionFilesSelected={handleModeratorFilesSelected}
          onSectionReorder={handleModeratorSectionReorder}
          onSettingsChange={handleModeratorSettingsChange}
          onSyncSections={handleModeratorSyncSections}
          onUploadToSection={handleModeratorUpload}
          photos={moderatorPhotos}
          sections={moderatorSections}
          settings={moderatorSettings}
          settingsBusy={moderatorSettingsBusy}
          uploadBusySectionId={moderatorUploadBusySectionId}
        />
      ) : null}

      {currentScreen === "legacy" ? <LegacyPage /> : null}
    </StorybookShell>
  );
}
