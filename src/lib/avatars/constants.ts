import type { PersonType } from "./schema";

// Deliberately narrower than LOGO_EXTENSIONS: a face reference is a photo, never svg or gif.
export const AVATAR_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
// The sign route rejects any other content type; AVATAR_IMAGE_ACCEPT is derived from the same
// set so the two cannot drift.
export const AVATAR_IMAGE_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
export const AVATAR_IMAGE_ACCEPT = [...AVATAR_IMAGE_CONTENT_TYPES].join(",");
export const AVATAR_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const AVATAR_IMAGE_MAX_LABEL = "15 MB";

// Falls back for a file whose browser-reported `type` is empty (some OSes don't set one for
// .jpg). Keys are lowercased extensions, without the dot.
export const AVATAR_IMAGE_EXTENSION_CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const AVATAR_NAME_MAX = 60;
export const AVATAR_STORY_MAX = 1000;

export const PERSON_TYPE_LABELS: Record<PersonType, string> = {
  generic: "Generic",
  specific: "Real person",
};

export const LIKENESS_CONSENT_STATEMENT = "I have this person's permission to use their likeness";

// Consent is bound to the photo the operator saw (D289 amended): a stale tab, a second
// operator, or a front replacement racing the request must never attach the confirmation to a
// different photo. Shared by planAvatarUpdate (the 400 when the request's frontUrl no longer
// matches), the PATCH route (the 409 when the DB write's own precondition catches a race the
// read-then-write window left open), and the Studio (matching the thrown message to know when
// to reload rather than merely toast).
export const LIKENESS_CONSENT_CHANGED_ERROR = "The front image changed. Confirm the permission again.";

// Completes the sentence "Still needed: …".
export const READINESS_GAP_LABELS = {
  name: "a name",
  front: "a front image",
  sheet: "a profile sheet",
  "sheet-stale": "a profile sheet that matches the new front image",
  consent: "permission to use this person's likeness",
} as const;
