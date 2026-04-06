"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
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
  groupPhotosByMonth,
} from "../lib/storybook";
import type {
  EventRecord,
  GuestGalleryResponse,
  GuestStoryResponse,
  GuestUploadResponse,
  PhotoCard,
  PhotoRecord,
  StorySectionCard,
  StorySectionRecord,
  StorySettingsRecord,
} from "../lib/types";

type ScreenKey = "timeline" | "gallery" | "upload" | "admin" | "legacy";
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
};

type AdminPhoto = PhotoRecord & {
  imageUrl: string | null;
};

const screenMap = new Map<string, ScreenKey>([
  ["/", "timeline"],
  ["/timeline", "timeline"],
  ["/gallery", "gallery"],
  ["/upload", "upload"],
  ["/admin", "admin"],
]);

const storedEventIdKey = "birthday-photo-app.event-id";

function getScreen(pathname: string): ScreenKey {
  return screenMap.get(pathname) || "legacy";
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
              inputMode="numeric"
              value={pin}
              onChange={(event) => onPinChange(event.target.value)}
              placeholder="••••"
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
  return (
    <section className="storybook-section">
      <div className="story-cover">
        <div className="story-cover-copy">
          <p className="storybook-overline">Story Timeline</p>
          <h1>{settings?.cover_title || `${event?.title || "Vaayu"} Story Timeline`}</h1>
          <p className="storybook-copy">
            {settings?.cover_subtitle ||
              "A premium scrapbook of milestones, little details, and birthday memories from Vaayu's first year."}
          </p>
          <button className="storybook-button storybook-button-secondary" onClick={onOpenGallery} type="button">
            Browse the Gallery
          </button>
        </div>
        <div className="story-cover-stack" aria-hidden="true">
          <div className="stack-card stack-card-large" />
          <div className="stack-card stack-card-tilt" />
          <div className="floating-balloon balloon-one" />
          <div className="floating-balloon balloon-two" />
        </div>
      </div>

      <div className="timeline-flow">
        {sections.map((section, index) => (
          <article className="timeline-chapter" key={section.id}>
            <div className="timeline-marker">
              <span>{String(index + 1).padStart(2, "0")}</span>
            </div>
            <div className="timeline-copy">
              <p className="timeline-label">{section.label}</p>
              <h2>{section.title}</h2>
              {section.subtitle ? <p className="timeline-subtitle">{section.subtitle}</p> : null}
              {section.story_text ? <p className="storybook-copy">{section.story_text}</p> : null}
            </div>
            <div className="timeline-media">
              {section.photos.length > 0 ? (
                <div className="timeline-photo-stack">
                  {section.photos.slice(0, 3).map((photo, photoIndex) => (
                    <figure
                      className={`timeline-photo-card timeline-photo-card-${photoIndex}`}
                      key={photo.id}
                    >
                      {photo.imageUrl ? <img alt={photo.title} src={photo.imageUrl} /> : <span />}
                    </figure>
                  ))}
                </div>
              ) : (
                <div className="timeline-placeholder">
                  <span>Curate photos for this chapter in Admin.</span>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
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
        aria-label="Close image viewer"
        className="lightbox-close"
        onClick={onClose}
        type="button"
      >
        ×
      </button>
      <button
        aria-label="Previous image"
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
        {active.imageUrl ? <img alt={active.title} src={active.imageUrl} /> : null}
        <figcaption>
          <strong>{active.title}</strong>
          <span>
            {selectedIndex + 1} / {photos.length}
          </span>
        </figcaption>
      </figure>
      <button
        aria-label="Next image"
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
  const groupedPhotos = useMemo(() => groupPhotosByMonth(photos), [photos]);

  return (
    <section className="storybook-section">
      <div className="gallery-header">
        <div>
          <p className="storybook-overline">Birthday Memories</p>
          <h1>{event?.title || "Vaayu's Birthday Gallery"}</h1>
          <p className="storybook-copy">
            Capture-month groupings keep the scrapbook feeling curated instead of list-like.
          </p>
        </div>
        <button className="storybook-button storybook-button-primary gallery-upload-button" onClick={onOpenUpload} type="button">
          Upload
        </button>
      </div>

      {groupedPhotos.length === 0 ? (
        <article className="storybook-card empty-card">
          <h2>No birthday photos yet</h2>
          <p className="storybook-copy">
            Once a memory is uploaded, it will appear here grouped by the month it was captured.
          </p>
        </article>
      ) : (
        groupedPhotos.map((group) => (
          <section className="gallery-group" key={group.key}>
            <div className="gallery-group-heading">
              <span>{group.label}</span>
            </div>
            <div className="gallery-masonry">
              {group.photos.map((photo, index) => (
                <button
                  className={`gallery-card ${
                    index % 6 === 4 ? "gallery-card-feature" : index % 3 === 0 ? "gallery-card-tall" : "gallery-card-square"
                  }`}
                  key={photo.id}
                  onClick={() => setSelectedIndex(photos.findIndex((item) => item.id === photo.id))}
                  type="button"
                >
                  <div className="gallery-card-media">
                    {photo.imageUrl ? <img alt={photo.title} src={photo.imageUrl} /> : <span />}
                  </div>
                  <div className="gallery-card-meta">
                    <strong>{photo.title}</strong>
                    <span>{photo.subtitle}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      <Lightbox
        onClose={() => setSelectedIndex(null)}
        onMove={(direction) => {
          setSelectedIndex((current) => {
            if (current === null) return current;
            return (current + direction + photos.length) % photos.length;
          });
        }}
        photos={photos}
        selectedIndex={selectedIndex}
      />
    </section>
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
  return (
    <section className="storybook-section">
      <article className="upload-hero">
        <div>
          <p className="storybook-overline">Upload Page</p>
          <h1>Add photos to Vaayu&apos;s scrapbook</h1>
          <p className="storybook-copy">
            Upload only. No guest name, no caption field, no extra friction.
          </p>
        </div>
      </article>

      <form className="storybook-card upload-card" onSubmit={onSubmit}>
        <div className="upload-grid">
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
              inputMode="numeric"
              placeholder="••••"
              value={pin}
              onChange={(event) => onPinChange(event.target.value)}
            />
          </label>
        </div>

        <label className="upload-dropzone">
          <input accept="image/*" multiple onChange={onFilesSelected} type="file" />
          <span>Drop photos here or choose from your phone</span>
          <small>We extract capture dates where possible and fall back to upload time.</small>
        </label>

        {previews.length > 0 ? (
          <div className="upload-preview-grid">
            {previews.map((preview) => (
              <article className="upload-preview-card" key={preview.id}>
                <img alt={preview.file.name} src={preview.url} />
                <div>
                  <strong>{preview.file.name}</strong>
                  <span>{formatMonthYear(preview.capturedAt)}</span>
                </div>
                <button
                  className="upload-preview-remove"
                  onClick={() => onRemovePreview(preview.id)}
                  type="button"
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
        ) : null}

        <div className="upload-footer">
          <p className={`inline-notice inline-notice-${notice.tone}`}>{notice.message}</p>
          <button className="storybook-button storybook-button-primary" disabled={busy || previews.length === 0} type="submit">
            {busy ? "Uploading..." : `Upload ${previews.length > 1 ? `${previews.length} photos` : "photo"}`}
          </button>
        </div>
      </form>
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
                    {photo.imageUrl ? <img alt={photo.caption || "Photo"} src={photo.imageUrl} /> : <span />}
                  </div>
                  <div className="admin-photo-meta">
                    <strong>{formatMonthYear(photo.captured_at ?? photo.created_at)}</strong>
                    <span>{photo.caption || "Gallery photo"}</span>
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

function StorybookShell({
  children,
  guestHref,
  currentScreen,
  notice,
  adminVisible,
}: {
  children: ReactNode;
  guestHref: (path: string) => string;
  currentScreen: ScreenKey;
  notice: Notice;
  adminVisible: boolean;
}) {
  const tabs = [
    { key: "timeline", href: guestHref("/"), label: "Story" },
    { key: "gallery", href: guestHref("/gallery"), label: "Gallery" },
    { key: "upload", href: guestHref("/upload"), label: "Upload" },
  ] as const;

  return (
    <main className="storybook-app-shell">
      <div className="storybook-backdrop" aria-hidden="true">
        <div className="backdrop-shape backdrop-shape-one" />
        <div className="backdrop-shape backdrop-shape-two" />
        <div className="backdrop-orbit" />
        <div className="backdrop-spark backdrop-spark-one" />
        <div className="backdrop-spark backdrop-spark-two" />
      </div>

      <header className="storybook-header">
        <Link className="storybook-brand" href={guestHref("/")}>
          <span className="storybook-brand-mark">V</span>
          <span>
            <strong>Vaayu</strong>
            <small>1 Year Around the Sun</small>
          </span>
        </Link>
        <nav className="storybook-nav" aria-label="Primary">
          {tabs.map((tab) => (
            <Link
              className={`storybook-tab ${currentScreen === tab.key ? "storybook-tab-active" : ""}`}
              href={tab.href}
              key={tab.key}
            >
              {tab.label}
            </Link>
          ))}
          {adminVisible ? (
            <Link
              className={`storybook-tab ${currentScreen === "admin" ? "storybook-tab-active" : ""}`}
              href="/admin"
            >
              Admin
            </Link>
          ) : null}
        </nav>
      </header>

      <div className="storybook-status">
        <p className={`inline-notice inline-notice-${notice.tone}`}>{notice.message}</p>
      </div>

      {children}
    </main>
  );
}

export function BirthdayApp({ initialGuestAccess }: BirthdayAppProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
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
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const eventCode = params.get("event");
    const pin = params.get("pin");
    if (!eventCode && !pin) return;
    setGuestAccess({
      eventCode: (eventCode || "").toUpperCase(),
      pin: pin || "",
    });
    setAdminEventCode((eventCode || "").toUpperCase());
  }, []);

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
        setTimelineEvent(storyData.event);
        setStorySettings(storyData.settings);
        setStorySections(
          storyData.sections.map((section) => ({
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
          })),
        );
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
    router.push(guestHref(pathname === "/admin" ? "/" : pathname));
  }

  async function handleUpload(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    if (!hasSupabaseClientEnv) {
      setNotice({ tone: "success", message: "Demo mode: upload UI updated, but no live backend is connected." });
      return;
    }
    if (!guestAccess.eventCode || !guestAccess.pin || uploadPreviews.length === 0) {
      setNotice({ tone: "error", message: "Add the event code, PIN, and at least one photo." });
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
      setNotice({ tone: "success", message: "Photos uploaded. Returning to the gallery." });
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
          .select("event_id, grouping, section_count, cover_title, cover_subtitle, updated_at")
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
      .select("event_id, grouping, section_count, cover_title, cover_subtitle, updated_at")
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
    const existing = [...adminSections].sort((left, right) => left.sort_order - right.sort_order);

    const inserts = [];
    for (let index = existing.length; index < targetCount; index += 1) {
      inserts.push({
        event_id: adminEvent.id,
        ...buildDefaultSectionSeed(index, grouping),
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
        photo.id === photoId ? { ...photo, ...data, imageUrl: photo.imageUrl } : photo,
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
      notice={notice}
    >
      {needsGuestAccess ? (
        <AccessGate
          body="Enter the event code and PIN to open Vaayu's scrapbook, browse the gallery, or upload photos."
          cta="Open the birthday story"
          eventCode={guestAccess.eventCode}
          onEventCodeChange={(value) => setGuestAccess((current) => ({ ...current, eventCode: value }))}
          onPinChange={(value) => setGuestAccess((current) => ({ ...current, pin: value }))}
          onSubmit={handleAccessSubmit}
          pin={guestAccess.pin}
          title="Open Vaayu's storybook"
        />
      ) : null}

      {!needsGuestAccess && currentScreen === "timeline" ? (
        <StoryTimelinePage
          event={timelineEvent}
          onOpenGallery={() => openGuestPage("/gallery")}
          sections={storySections}
          settings={storySettings}
        />
      ) : null}

      {!needsGuestAccess && currentScreen === "gallery" ? (
        <GalleryPage
          event={timelineEvent}
          onOpenUpload={() => openGuestPage("/upload")}
          photos={galleryPhotos}
        />
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

      {currentScreen === "legacy" ? <LegacyPage /> : null}
    </StorybookShell>
  );
}
