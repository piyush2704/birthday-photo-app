import { EventRecord, PhotoCard, ProfileRecord } from "./types";

export const demoEvent: EventRecord = {
  id: "demo-event-id",
  title: "Ava's 5th Birthday",
  public_code: "AVA5",
  moderation_required: true,
  created_at: "2026-04-03T02:26:10.000Z",
};

export const demoProfile: ProfileRecord = {
  id: "demo-user-id",
  display_name: "Maya",
  created_at: "2026-04-03T02:30:00.000Z",
};

export const demoGallery: PhotoCard[] = [
  {
    id: "1",
    title: "Balloon race",
    subtitle: "Uploaded by Maya at 2:15 PM",
    status: "approved",
    imageUrl: null,
    capturedAt: "2026-04-03T14:15:00.000Z",
  },
  {
    id: "2",
    title: "Cake table",
    subtitle: "Uploaded by Daniel at 2:32 PM",
    status: "approved",
    imageUrl: null,
    capturedAt: "2026-04-03T14:32:00.000Z",
  },
  {
    id: "3",
    title: "Slide group photo",
    subtitle: "Uploaded by Priya at 3:05 PM",
    status: "approved",
    imageUrl: null,
    capturedAt: "2026-04-03T15:05:00.000Z",
  },
];

export const demoQueue: PhotoCard[] = [
  {
    id: "q1",
    title: "Kids playing tag",
    subtitle: "Awaiting moderation",
    status: "pending",
    imageUrl: null,
    capturedAt: "2026-04-03T15:20:00.000Z",
  },
  {
    id: "q2",
    title: "Pinata swing",
    subtitle: "Awaiting moderation",
    status: "pending",
    imageUrl: null,
    capturedAt: "2026-04-03T15:45:00.000Z",
  },
];
