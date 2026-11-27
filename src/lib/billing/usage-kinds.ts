// The four kinds of work the Usage page splits credits into (D597), from a run's generations.type
// (GenerationRow in src/lib/db/types.ts). Client-safe.

export const USAGE_KINDS = ["video", "image", "voice", "text"] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

export const USAGE_KIND_LABEL: Record<UsageKind, string> = {
  video: "Video",
  image: "Image",
  voice: "Voice and sound",
  text: "Writing",
};

// Every charged run type. Record-only types (scripts, the brand KB, the copilot…) charge nothing,
// so they never reach a credits view.
const KIND_OF_TYPE: Record<string, UsageKind> = {
  video: "video",
  edit: "video", // a video edit
  lipsync: "video",
  image: "image",
  voice: "voice",
  dub: "voice",
  transcribe: "voice",
  prompt: "text",
};

/** The kind of work a run type belongs to. A type added later and not listed here counts as
 *  writing until it is. */
export function kindOf(type: string | null): UsageKind {
  return (type && KIND_OF_TYPE[type]) || "text";
}

/** The run types of one kind, for filtering runs by kind. */
export function typesOf(kind: UsageKind): string[] {
  return Object.entries(KIND_OF_TYPE).filter(([, k]) => k === kind).map(([t]) => t);
}

export function isUsageKind(v: unknown): v is UsageKind {
  return (USAGE_KINDS as readonly unknown[]).includes(v);
}

const RUN_TYPE_LABEL: Record<string, string> = {
  image: "Image",
  video: "Video",
  prompt: "Writing",
  voice: "Voice",
  dub: "Dub",
  lipsync: "Lip sync",
  transcribe: "Captions",
  edit: "Video edit",
};

/** A run type in plain words: "Lip sync", "Captions". */
export function runTypeLabel(type: string): string {
  return RUN_TYPE_LABEL[type] ?? type.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
