import {
  MAX_ANNOTATIONS_PER_DECISION,
  MAX_FRAME_BYTES,
  MAX_MASK_BYTES,
  MAX_TOTAL_BYTES,
} from "./constants";

export type AnnotationKind = "image" | "video-frame";

// The wire shape a senior's client sends with "Request changes" (D211/D213).
// overlayBase64 is the PAINTED OVERLAY png (alpha > 0 = region) — display-ready,
// and convertible to the OpenAI mask by overlayToMaskRGBA at replay time (D209).
export type AnnotationPayload = {
  seq: number;
  kind: AnnotationKind;
  timecodeMs: number | null;
  overlayBase64: string;
  frameBase64: string | null;
  note: string;
};

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
    if (a.kind === "image" && (a.timecodeMs !== null || a.frameBase64 !== null)) {
      return `Annotation ${a.seq}: image annotations carry no timecode or frame.`;
    }
    if (a.kind === "video-frame") {
      if (a.timecodeMs === null) return `Annotation ${a.seq} is missing its timecode.`;
      if (a.frameBase64 === null) return `Annotation ${a.seq} is missing its captured frame.`;
    }
    const maskBytes = base64Bytes(a.overlayBase64);
    const frameBytes = base64Bytes(a.frameBase64 ?? "");
    if (maskBytes === 0) return `Annotation ${a.seq} has an empty mask.`;
    if (maskBytes > MAX_MASK_BYTES) return `Annotation ${a.seq}: mask exceeds 1 MB.`;
    if (frameBytes > MAX_FRAME_BYTES) return `Annotation ${a.seq}: frame exceeds 2 MB.`;
    total += maskBytes + frameBytes;
  }
  if (total > MAX_TOTAL_BYTES) return "Annotations exceed the 8 MB payload limit.";
  return null;
}
