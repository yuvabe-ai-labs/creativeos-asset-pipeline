import type { PersonType } from "./schema";

// Deliberately narrower than LOGO_EXTENSIONS: a face reference is a photo, never svg or gif.
export const AVATAR_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
// The sign route rejects any other content type; AVATAR_IMAGE_ACCEPT is derived from the same
// set so the two cannot drift.
export const AVATAR_IMAGE_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
export const AVATAR_IMAGE_ACCEPT = [...AVATAR_IMAGE_CONTENT_TYPES].join(",");
export const AVATAR_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const AVATAR_IMAGE_MAX_LABEL = "15 MB";

export const AVATAR_NAME_MAX = 60;
export const AVATAR_STORY_MAX = 1000;

export const PERSON_TYPE_LABELS: Record<PersonType, string> = {
  generic: "Generic",
  specific: "Real person",
};

// Completes the sentence "Still needed: …".
export const READINESS_GAP_LABELS = {
  name: "a name",
  front: "a front image",
  sheet: "a profile sheet",
  "sheet-stale": "a profile sheet that matches the new front image",
} as const;
