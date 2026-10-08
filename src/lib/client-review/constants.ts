// D309 client review share. Limits are copied verbatim from the spec
// (docs/superpowers/specs/2026-09-30-client-review-share-design.md).
export const REVIEWER_NAME_MAX = 60;
export const COMMENT_BODY_MAX = 2000;
// No cut runs a day; a larger stamp is a forged request, not a moment in the film.
export const TIMECODE_MAX_MS = 86_400_000;
// Bounds one public link's write volume (the token is the only credential).
export const MAX_COMMENTS_PER_REVIEW = 500;
export const CUT_EXTENSIONS: ReadonlySet<string> = new Set(["mp4", "mov", "webm"]);
// Some browsers report an empty File.type for .mov; the sign route rejects non-video/* types.
export const CUT_CONTENT_TYPES: Readonly<Record<string, string>> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};
export const CUT_MAX_BYTES = 524_288_000; // 500 MB — browser PUTs straight to GCS
export const REVIEWER_NAME_KEY = "reviewer_name";
