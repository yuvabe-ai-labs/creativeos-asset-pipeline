// Spec §5.3 caps — guardrails, not targets (brush overlays compress to tens of KB).
export const MAX_ANNOTATIONS_PER_DECISION = 20;
export const MAX_MASK_BYTES = 1_048_576; // 1 MB per painted overlay
export const MAX_FRAME_BYTES = 2_097_152; // 2 MB per captured video still
export const MAX_TOTAL_BYTES = 8_388_608; // 8 MB whole action payload

// No bucket name or signed-URL TTL here: annotation assets go to the one GCS bucket every
// other generated asset uses, addressed by path and read through publicUrlFor (D217).
