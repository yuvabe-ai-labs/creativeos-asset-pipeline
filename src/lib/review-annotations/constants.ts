// Caps sized to the ACTUAL transport (D249). Annotations ride a Server Action body, so
// the ceiling is not ours to pick: Next allows 1 MB by default, and Vercel hard-caps a
// function request body at 4.5 MB. The 8 MB total / 2 MB-per-frame in the spec was never
// reachable — one full-res video still busts both limits on its own.
//
// next.config.ts raises serverActions.bodySizeLimit to 4 MB; this total stays under it
// with room for the action's own fields. Only brush overlays travel now — no video
// stills — and those compress to tens of KB, so 3 MB is generous, not tight.
export const MAX_ANNOTATIONS_PER_DECISION = 20;
export const MAX_MASK_BYTES = 1_048_576; // 1 MB per painted overlay
export const MAX_TOTAL_BYTES = 3_145_728; // 3 MB whole action payload

// No bucket name or signed-URL TTL here: annotation assets go to the one GCS bucket every
// other generated asset uses, addressed by path and read through publicUrlFor (D247).
