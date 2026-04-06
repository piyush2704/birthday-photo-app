import type {
  EventRecord,
  GuestGalleryPhoto,
  PhotoCard,
  StorySectionCard,
  StorySettingsRecord,
} from "./types";

export const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatMonthYear(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function monthKeyFromDate(dateString: string) {
  const date = new Date(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function groupPhotosByMonth<T extends { capturedAt: string }>(photos: T[]) {
  const groups = new Map<string, T[]>();
  photos.forEach((photo) => {
    const key = monthKeyFromDate(photo.capturedAt);
    const existing = groups.get(key) || [];
    existing.push(photo);
    groups.set(key, existing);
  });
  return Array.from(groups.entries())
    .sort(([left], [right]) => (left < right ? 1 : -1))
    .map(([key, items]) => ({
      key,
      label: formatMonthYear(items[0].capturedAt),
      photos: items,
    }));
}

export function buildPhotoCardFromGuest(photo: GuestGalleryPhoto): PhotoCard {
  return {
    id: photo.id,
    title: photo.title,
    subtitle: photo.subtitle,
    status: photo.status,
    imageUrl: photo.image_url,
    fullImageUrl: photo.full_image_url ?? photo.image_url,
    capturedAt: photo.captured_at,
  };
}

export function buildDefaultSectionSeed(index: number, grouping: "month" | "year") {
  const order = index + 1;
  if (grouping === "year") {
    return {
      label: `Year ${String(order).padStart(2, "0")}`,
      title: `Chapter ${order}`,
      subtitle: "A keepsake chapter waiting for photos",
      story_text: "Add a few lines here to turn this group of images into part of Vaayu's scrapbook story.",
      sort_order: order,
      visible: true,
    };
  }

  return {
    label: `Month ${String(order).padStart(2, "0")}`,
    title: MONTH_LABELS[(order - 1) % 12],
    subtitle: "A little chapter from Vaayu's first year",
    story_text: "Write a short memory, milestone, or note to frame the photos in this chapter.",
    sort_order: order,
    visible: true,
  };
}

export function getFileExtension(file: File) {
  const match = file.name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "jpg";
}

export async function extractCaptureDate(file: File): Promise<{ capturedAt: string; source: "exif" | "upload" }> {
  const fallback = new Date().toISOString();

  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    if (view.getUint16(0, false) !== 0xffd8) {
      return { capturedAt: fallback, source: "upload" };
    }

    let offset = 2;
    while (offset < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      const size = view.getUint16(offset + 2, false);
      if (marker === 0xe1) {
        const exifHeader = String.fromCharCode(
          view.getUint8(offset + 4),
          view.getUint8(offset + 5),
          view.getUint8(offset + 6),
          view.getUint8(offset + 7),
        );
        if (exifHeader === "Exif") {
          const tiffStart = offset + 10;
          const littleEndian = view.getUint16(tiffStart, false) === 0x4949;
          const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
          const exifIfdPointer = readIfdValue(view, tiffStart, tiffStart + firstIfdOffset, 0x8769, littleEndian);
          const exifIfdOffset = typeof exifIfdPointer === "number" ? tiffStart + exifIfdPointer : null;
          if (exifIfdOffset) {
            const dateRaw =
              readIfdValue(view, tiffStart, exifIfdOffset, 0x9003, littleEndian) ||
              readIfdValue(view, tiffStart, exifIfdOffset, 0x9004, littleEndian) ||
              readIfdValue(view, tiffStart, exifIfdOffset, 0x0132, littleEndian);
            if (typeof dateRaw === "string") {
              const parsed = parseExifDate(dateRaw);
              if (parsed) {
                return { capturedAt: parsed.toISOString(), source: "exif" };
              }
            }
          }
        }
      }
      offset += 2 + size;
    }
  } catch {
    return { capturedAt: fallback, source: "upload" };
  }

  return { capturedAt: fallback, source: "upload" };
}

function readIfdValue(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  tagToFind: number,
  littleEndian: boolean,
) {
  const entries = view.getUint16(ifdOffset, littleEndian);
  for (let index = 0; index < entries; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    const tag = view.getUint16(entryOffset, littleEndian);
    if (tag !== tagToFind) continue;
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const valueOffset = entryOffset + 8;
    if (type === 2) {
      const pointer = count > 4 ? tiffStart + view.getUint32(valueOffset, littleEndian) : valueOffset;
      let output = "";
      for (let charIndex = 0; charIndex < count - 1; charIndex += 1) {
        output += String.fromCharCode(view.getUint8(pointer + charIndex));
      }
      return output;
    }
    if (type === 4) {
      return view.getUint32(valueOffset, littleEndian);
    }
  }
  return null;
}

function parseExifDate(value: string) {
  const match = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export const demoStoryEvent: EventRecord = {
  id: "demo-event-id",
  title: "Vaayu's 1st Birthday",
  public_code: "VAAYU",
  moderation_required: false,
  created_at: "2026-04-03T02:26:10.000Z",
};

export const demoStorySettings: StorySettingsRecord = {
  event_id: "demo-event-id",
  grouping: "month",
  section_count: 12,
  cover_title: "Vaayu's First Trip Through the Year",
  cover_subtitle: "A storybook scrapbook of little moments, one month at a time.",
  updated_at: "2026-04-03T02:30:00.000Z",
};

export const demoStorySections: StorySectionCard[] = [
  {
    id: "s1",
    event_id: "demo-event-id",
    label: "Month 01",
    title: "Hello, Little Love",
    subtitle: "The beginning of everything",
    story_text:
      "Tiny fingers, warm cuddles, and a whole new rhythm for the family. Vaayu's first days were soft, sleepy, and full of wonder.",
    sort_order: 1,
    visible: true,
    created_at: "2026-04-03T02:30:00.000Z",
    updated_at: "2026-04-03T02:30:00.000Z",
    photos: [],
  },
  {
    id: "s2",
    event_id: "demo-event-id",
    label: "Month 06",
    title: "Halfway to One",
    subtitle: "Giggles, cheeks, and growing strong",
    story_text:
      "By the middle of the year, Vaayu was already full of expression, curious glances, and those little moments the family never wanted to forget.",
    sort_order: 2,
    visible: true,
    created_at: "2026-04-03T02:30:00.000Z",
    updated_at: "2026-04-03T02:30:00.000Z",
    photos: [],
  },
  {
    id: "s3",
    event_id: "demo-event-id",
    label: "Month 12",
    title: "Birthday Chapter",
    subtitle: "One year old and so deeply loved",
    story_text:
      "Cake crumbs, balloons, and warm arms everywhere. This chapter holds the memories that turned Vaayu's first birthday into a scrapbook worth keeping forever.",
    sort_order: 3,
    visible: true,
    created_at: "2026-04-03T02:30:00.000Z",
    updated_at: "2026-04-03T02:30:00.000Z",
    photos: [],
  },
];

export const demoGalleryPhotos: PhotoCard[] = [
  {
    id: "g1",
    title: "Birthday scrapbook moment",
    subtitle: "March 2026",
    status: "approved",
    imageUrl: null,
    capturedAt: "2026-03-12T10:00:00.000Z",
  },
  {
    id: "g2",
    title: "Little smiles",
    subtitle: "February 2026",
    status: "approved",
    imageUrl: null,
    capturedAt: "2026-02-08T10:00:00.000Z",
  },
  {
    id: "g3",
    title: "Weekend cuddle",
    subtitle: "January 2026",
    status: "approved",
    imageUrl: null,
    capturedAt: "2026-01-19T10:00:00.000Z",
  },
];
