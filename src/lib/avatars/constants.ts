import type { PersonType } from "./schema";

// Deliberately narrower than LOGO_EXTENSIONS: a face reference is a photo, never svg or gif.
export const AVATAR_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
export const AVATAR_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
export const AVATAR_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const AVATAR_IMAGE_MAX_LABEL = "15 MB";

export const AVATAR_NAME_MAX = 60;
export const AVATAR_STORY_MAX = 1000;

export const PERSON_TYPE_LABELS: Record<PersonType, string> = {
  generic: "Generic",
  specific: "Real person",
};

// The tick the operator confirms, per answer to "Is this a real person?" (D288).
export const LIKENESS_STATEMENTS: Record<PersonType, string> = {
  specific: "I have this person's permission to use their likeness",
  generic: "This is not a real person",
};

// Completes the sentence "Still needed: …".
export const READINESS_GAP_LABELS = {
  name: "a name",
  front: "a front image",
  sheet: "a profile sheet",
  "sheet-stale": "a profile sheet that matches the new front image",
  declaration: "the real-person declaration",
} as const;
