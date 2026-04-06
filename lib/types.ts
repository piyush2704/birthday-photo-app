export type PhotoStatus = "pending" | "approved" | "rejected";

export type EventRole = "owner" | "admin" | "guest";

export type ProfileRecord = {
  id: string;
  display_name: string | null;
  created_at: string;
};

export type EventRecord = {
  id: string;
  title: string;
  public_code: string;
  moderation_required: boolean;
  created_at: string;
};

export type EventMemberRecord = {
  id: string;
  event_id: string;
  user_id: string;
  role: EventRole;
  joined_at: string;
};

export type PhotoRecord = {
  id: string;
  event_id: string;
  uploader_user_id: string | null;
  uploader_display_name: string | null;
  storage_path: string;
  caption: string | null;
  status: PhotoStatus;
  is_visible: boolean;
  captured_at: string | null;
  capture_source: "exif" | "upload";
  timeline_section_id: string | null;
  timeline_sort_order: number;
  created_at: string;
};

export type PhotoCard = {
  id: string;
  title: string;
  subtitle: string;
  status: PhotoStatus;
  imageUrl: string | null;
  fullImageUrl?: string | null;
  capturedAt: string;
  visible?: boolean;
  timelineSectionId?: string | null;
  timelineSortOrder?: number;
};

export type StorySettingsRecord = {
  event_id: string;
  grouping: "month" | "year";
  section_count: number;
  birth_date: string | null;
  cover_title: string;
  cover_subtitle: string;
  updated_at: string;
};

export type StorySectionRecord = {
  id: string;
  event_id: string;
  label: string;
  title: string;
  subtitle: string | null;
  story_text: string | null;
  sort_order: number;
  visible: boolean;
  created_at: string;
  updated_at: string;
};

export type StorySectionCard = StorySectionRecord & {
  photos: PhotoCard[];
};

export type JoinEventRequest = {
  event_code: string;
  pin: string;
};

export type JoinEventResponse = {
  event_id: string;
};

export type CreateEventRequest = {
  title: string;
  public_code: string;
  pin: string;
  moderation_required: boolean;
};

export type CreateEventResponse = {
  event_id: string;
};

export type GuestUploadRequest = {
  event_code: string;
  pin: string;
  file_ext: string;
  captured_at?: string;
};

export type GuestUploadResponse = {
  photo_id: string;
  storage_path: string;
  signed_url: string;
  token: string;
  status: Extract<PhotoStatus, "pending" | "approved">;
};

export type GuestGalleryRequest = {
  event_code: string;
  pin: string;
};

export type GuestGalleryPhoto = {
  id: string;
  title: string;
  subtitle: string;
  status: Extract<PhotoStatus, "approved">;
  image_url: string | null;
  full_image_url?: string | null;
  captured_at: string;
};

export type GuestGalleryResponse = {
  event: EventRecord;
  photos: GuestGalleryPhoto[];
};

export type GuestStoryResponse = {
  event: EventRecord;
  settings: StorySettingsRecord | null;
  sections: Array<
    Omit<StorySectionRecord, "event_id" | "created_at" | "updated_at"> & {
      photos: GuestGalleryPhoto[];
    }
  >;
};

export type ModeratorGalleryRequest = {
  event_code: string;
  moderator_pin: string;
};

export type ModeratorGalleryPhoto = {
  id: string;
  title: string;
  subtitle: string;
  status: PhotoStatus;
  image_url: string | null;
  full_image_url?: string | null;
  captured_at?: string;
  is_visible?: boolean;
  timeline_section_id?: string | null;
  timeline_sort_order?: number;
};

export type ModeratorGalleryResponse = {
  event: EventRecord;
  photos: ModeratorGalleryPhoto[];
};

export type ModeratorStorySection = Omit<StorySectionRecord, "event_id" | "created_at" | "updated_at"> & {
  photos: ModeratorGalleryPhoto[];
};

export type ModeratorStoryResponse = {
  event: EventRecord;
  settings: StorySettingsRecord;
  sections: ModeratorStorySection[];
  photos: ModeratorGalleryPhoto[];
};

export type ModeratorUploadRequest = {
  event_code: string;
  moderator_pin: string;
  file_ext: string;
  captured_at?: string;
  timeline_section_id?: string | null;
  timeline_sort_order?: number;
};

export type ModeratorUploadResponse = {
  photo_id: string;
  storage_path: string;
  signed_url: string;
  token: string;
};

export type ModeratorDeleteRequest = {
  event_code: string;
  moderator_pin: string;
  photo_id: string;
};

export type ModeratorDeleteResponse = {
  photo_id: string;
  deleted: true;
};
