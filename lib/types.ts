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
  created_at: string;
};

export type PhotoCard = {
  id: string;
  title: string;
  subtitle: string;
  status: PhotoStatus;
  imageUrl: string | null;
};

export type JoinEventRequest = {
  event_code: string;
  pin: string;
};

export type JoinEventResponse = {
  event_id: string;
};

export type GuestUploadRequest = {
  event_code: string;
  pin: string;
  uploader_display_name?: string;
  file_ext: string;
};

export type GuestUploadResponse = {
  photo_id: string;
  storage_path: string;
  signed_url: string;
  token: string;
  status: Extract<PhotoStatus, "pending" | "approved">;
};
