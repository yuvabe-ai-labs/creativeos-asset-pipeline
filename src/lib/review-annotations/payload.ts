import {
  MAX_ANNOTATIONS_PER_DECISION,
  MAX_MASK_BYTES,
  MAX_TOTAL_BYTES,
} from "./constants";

export type AnnotationKind = "image" | "video-frame";

// Bounding box of the painted stroke in FRACTIONS of the media's natural size —
// resolution-independent, so the pin renders correctly at any display scale. Lives here
// rather than in draft.ts because it is part of the WIRE shape now (D248): the client
// used to strip it at submit, which left stored rows with no geometry for their pins.

// The wire shape a senior's client sends with "Request changes" (D241/D243).
// overlayBase64 is the PAINTED OVERLAY png (alpha > 0 = region) — display-ready,
// and convertible to the OpenAI mask by overlayToMaskRGBA at replay time (D239).
export type AnnotationPayload = {
  seq: number;
  kind: AnnotationKind;
  timecodeMs: number | null;
  overlayBase64: string;
  note: string;
  // Null when the stroke produced no measurable box (defensive — the composer only
  // commits after a stroke), and on rows written before D248.
  bounds: RegionBounds | null;
};

export type RegionBounds = { x: number; y: number; w: number; h: number };

// Fractions, so anything outside [0,1] would render a pin off the media. Width/height of
// 0 is allowed: a single tap is a legitimate point annotation.
function boundsInvalid(b: RegionBounds): boolean {
  return [b.x, b.y, b.w, b.h].some((n) => !Number.isFinite(n) || n < 0 || n > 1);
}

export function base64Bytes(b64: string): number {
  if (!b64) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (b64.length * 3) / 4 - padding;
}

// Returns a human-readable error, or null when the batch is acceptable. Shared by
// the client (pre-submit) and the server action (enforcement) — one implementation,
// never two drifting copies.
export function validateAnnotations(anns: AnnotationPayload[]): string | null {
  if (anns.length > MAX_ANNOTATIONS_PER_DECISION) {
    return `At most ${MAX_ANNOTATIONS_PER_DECISION} annotations per decision.`;
  }
  let total = 0;
  const seen = new Set<number>();
  for (const [i, a] of anns.entries()) {
    if (a.seq !== i + 1 || seen.has(a.seq)) {
      return "Annotation seq numbers must be continuous from 1.";
    }
    seen.add(a.seq);
    if (!a.note.trim()) return `Annotation ${a.seq} has an empty note.`;
    if (a.kind === "image") {
      if (a.timecodeMs != null) {
        return `Annotation ${a.seq}: image annotations carry no timecode.`;
      }
    } else if (a.kind === "video-frame") {
      // D249: no captured still travels any more — the reader seeks the video to this
      // timecode, so the timecode IS the frame reference.
      if (a.timecodeMs == null) return `Annotation ${a.seq} is missing its timecode.`;
    } else {
      return `Annotation ${a.seq} has an unknown kind.`;
    }
    if (a.bounds && boundsInvalid(a.bounds)) {
      return `Annotation ${a.seq}: region bounds must be fractions between 0 and 1.`;
    }
    const maskBytes = base64Bytes(a.overlayBase64);
    if (maskBytes === 0) return `Annotation ${a.seq} has an empty mask.`;
    if (maskBytes > MAX_MASK_BYTES) return `Annotation ${a.seq}: mask exceeds 1 MB.`;
    total += maskBytes;
  }
  if (total > MAX_TOTAL_BYTES) return "Annotations exceed the 3 MB payload limit.";
  return null;
}
