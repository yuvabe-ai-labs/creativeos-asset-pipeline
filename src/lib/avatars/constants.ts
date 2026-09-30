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

// ── Generation (plan 2) ───────────────────────────────────────────────────────

// Fixed, never operator-selectable: a front image is a portrait, a sheet is a wide strip.
export const AVATAR_FRONT_ASPECT = "3:4";
export const AVATAR_SHEET_ASPECT = "16:9";

export const AVATAR_BATCH_DEFAULT = 4;
export const AVATAR_BATCH_MAX = 8;
export const AVATAR_DESCRIPTION_MAX = 1500;

export const AVATAR_STYLES = [
  { id: "photoreal", label: "Photoreal", phrase: "Photorealistic, natural skin texture, shot on a full-frame camera." },
  { id: "illustrated", label: "Illustrated", phrase: "Clean editorial illustration, consistent line weight, flat considered colour." },
  { id: "3d", label: "3D", phrase: "Stylised 3D character render, soft global illumination, subsurface skin." },
] as const;
export type AvatarStyleId = (typeof AVATAR_STYLES)[number]["id"];

// Optional quick chips. Each adds one plain phrase to the prompt; nothing is stored separately.
export const AVATAR_ATTRIBUTES = {
  gender: ["Female", "Male", "Non-binary"],
  age: ["18–24", "25–34", "35–44", "45–54", "55+"],
  ethnicity: [
    "South Asian", "East Asian", "Southeast Asian", "Black", "Middle Eastern",
    "Latino", "White", "Mixed",
  ],
} as const;
export type AvatarAttributes = Partial<Record<keyof typeof AVATAR_ATTRIBUTES, string>>;

// Labels for the attribute selects, and the sentinel value for "no preference" — moved here
// from avatar-describe-panel.tsx (plan 2 review) since they describe AVATAR_ATTRIBUTES itself,
// not the panel's layout.
export const ATTRIBUTE_LABELS: Record<keyof typeof AVATAR_ATTRIBUTES, string> = {
  gender: "Gender", age: "Age", ethnicity: "Ethnicity",
};
export const ANY = "any";

// Appended to every front prompt. These are the conditions that make a usable face reference,
// so the operator cannot write them away.
export const AVATAR_FRAMING_CLAUSE =
  "One person only, facing the camera, waist-up, neutral relaxed expression, even soft light, " +
  "plain light-grey seamless background, no text, no logos, no props in hand.";

// The only image model whose faces Seedance accepts as a reference (spec §8, D290). Named
// once: if the live model list shows a different id (spec §10, question 3), change it here.
export const SEEDANCE_FACE_MODEL_ID = "seedream:seedream-5-0-lite";

// A generated avatar runs on Seedance, so the default is the model Seedance will take.
export const AVATAR_DEFAULT_FRONT_MODEL_ID = SEEDANCE_FACE_MODEL_ID;
// The handoff design takes the model sheet from Nano Banana, whichever face it starts with.
export const AVATAR_DEFAULT_SHEET_MODEL_ID = "gemini:gemini-3-pro-image";

// A stored upload name as buildStoredName produces it: slug, "__", timestamp, extension. Used as
// an allow-list by the upload finalize route, so a crafted name ("..", a backslash, "%2e") can
// never resolve to another avatar's object.
export const AVATAR_STORED_NAME_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
