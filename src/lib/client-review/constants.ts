// D279 client review share. Limits are copied verbatim from the spec
// (docs/superpowers/specs/2026-09-30-client-review-share-design.md).
export const REVIEWER_NAME_MAX = 60;
export const COMMENT_BODY_MAX = 2000;
export const CUT_EXTENSIONS: ReadonlySet<string> = new Set(["mp4", "mov", "webm"]);
export const CUT_MAX_BYTES = 524_288_000; // 500 MB — browser PUTs straight to GCS
export const REVIEWER_NAME_KEY = "reviewer_name";
