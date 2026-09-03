// Spec §5.3 caps — guardrails, not targets (brush overlays compress to tens of KB).
export const MAX_ANNOTATIONS_PER_DECISION = 20;
export const MAX_MASK_BYTES = 1_048_576; // 1 MB per painted overlay
export const MAX_FRAME_BYTES = 2_097_152; // 2 MB per captured video still
export const MAX_TOTAL_BYTES = 8_388_608; // 8 MB whole action payload
export const ANNOTATION_BUCKET = "review-annotations";
export const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h, refetched on 403
