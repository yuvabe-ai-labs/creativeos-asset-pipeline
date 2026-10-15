// D374/D375 — the Dubbing node's shapes. Client-safe: the card, focus view, usage popover and
// the server all read these.

/** The source's spoken language. The vendor needs it; the view has one select by design (D374). */
export const DUB_SOURCE_LANGUAGE = "en-IN";

export const DUB_LANGUAGES = [
  { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "mr-IN", label: "Marathi" },
  { code: "or-IN", label: "Odia" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "as-IN", label: "Assamese" },
] as const;

export type DubLanguage = (typeof DUB_LANGUAGES)[number]["code"];
export const DEFAULT_DUB_LANGUAGE: DubLanguage = "hi-IN";

const CODES = new Set<string>(DUB_LANGUAGES.map((l) => l.code));

export function isDubLanguage(v: unknown): v is DubLanguage {
  return typeof v === "string" && CODES.has(v);
}

export function dubLanguageLabel(code: string): string {
  return DUB_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/**
 * How the translation sounds: the vendor's `register`, in plain words. Order is what the picker
 * shows; the hints follow the vendor's own guidance (docs: "control translation tone").
 */
export const DUB_STYLES = [
  { code: "modern-colloquial", label: "Everyday", hint: "Casual, current speech. Best for reels, ads and social." },
  { code: "common-indic", label: "Simple", hint: "Neutral words understood across India." },
  { code: "formal", label: "Formal", hint: "Polished and respectful, no slang." },
  { code: "classic-colloquial", label: "Traditional", hint: "Classic, literary speech. For devotional or heritage stories." },
  { code: "academic", label: "Technical", hint: "Precise, keeps technical terms. For tutorials and explainers." },
  { code: "auto", label: "Let it decide", hint: "Picks a style from what is said." },
] as const;

export type DubStyle = (typeof DUB_STYLES)[number]["code"];
export const DEFAULT_DUB_STYLE: DubStyle = "modern-colloquial";

const STYLE_CODES = new Set<string>(DUB_STYLES.map((s) => s.code));

export function isDubStyle(v: unknown): v is DubStyle {
  return typeof v === "string" && STYLE_CODES.has(v);
}

export function dubStyleLabel(code: string): string {
  return DUB_STYLES.find((s) => s.code === code)?.label ?? code;
}

/** D375 — a Dubbing version's output: the three stages of one dub. */
export type DubbingOutput = {
  language: DubLanguage;
  original: string;
  dubbed: string;
  dubbedAudio: string;
  lipSynced: string | null;
  /** The translation style it was dubbed in. Absent on dubs made before the style existed. */
  style?: DubStyle;
};

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function readDubbingOutput(v: unknown): DubbingOutput | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  if (!isDubLanguage(o.language) || !isStr(o.original) || !isStr(o.dubbed) || !isStr(o.dubbedAudio)) return null;
  if (o.lipSynced !== null && o.lipSynced !== undefined && !isStr(o.lipSynced)) return null;
  return {
    language: o.language,
    original: o.original,
    dubbed: o.dubbed,
    dubbedAudio: o.dubbedAudio,
    lipSynced: isStr(o.lipSynced) ? o.lipSynced : null,
    ...(isDubStyle(o.style) ? { style: o.style } : {}),
  };
}

export type DubStage = "original" | "dubbed" | "lipSynced";

export function furthestStage(o: DubbingOutput): DubStage {
  return o.lipSynced ? "lipSynced" : "dubbed";
}

export function stageUrl(o: DubbingOutput, stage: DubStage): string | null {
  return stage === "original" ? o.original : stage === "dubbed" ? o.dubbed : o.lipSynced;
}

/** Stored on `generations.inputs_snapshot.dub` and the version's `inputs_used.dub`. */
export type DubRecord = {
  sourceNodeId: string;
  sourceVersionId: string;
  sourceUrl: string;
  srcLang: string;
  targetLang: DubLanguage;
  durationSeconds: number;
  provider: string;
  model: string;
  style?: DubStyle;
  vendorJobId?: string;
};

export function readDubRecord(v: unknown): DubRecord | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  const d = o.durationSeconds;
  if (
    !isStr(o.sourceNodeId) || !isStr(o.sourceVersionId) || !isStr(o.sourceUrl) || !isStr(o.srcLang) ||
    !isDubLanguage(o.targetLang) || typeof d !== "number" || !(d > 0) || !isStr(o.provider) || !isStr(o.model)
  ) return null;
  return {
    sourceNodeId: o.sourceNodeId, sourceVersionId: o.sourceVersionId, sourceUrl: o.sourceUrl,
    srcLang: o.srcLang, targetLang: o.targetLang, durationSeconds: d, provider: o.provider, model: o.model,
    ...(isDubStyle(o.style) ? { style: o.style } : {}),
    ...(isStr(o.vendorJobId) ? { vendorJobId: o.vendorJobId } : {}),
  };
}

/** Stored on `generations.inputs_snapshot.lipSync` (which version) and merged into that
 *  version's `inputs_used.lipSync` (how many runs, the last vendor request). */
export type LipSyncRecord = {
  versionId: string;
  provider: string;
  model: string;
  runs: number;
  lastRanAt?: string;
  vendorRequestId?: string;
};

export function readLipSyncRecord(v: unknown): LipSyncRecord | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  if (!isStr(o.versionId) || !isStr(o.provider) || !isStr(o.model) || typeof o.runs !== "number") return null;
  return {
    versionId: o.versionId, provider: o.provider, model: o.model, runs: o.runs,
    ...(isStr(o.lastRanAt) ? { lastRanAt: o.lastRanAt } : {}),
    ...(isStr(o.vendorRequestId) ? { vendorRequestId: o.vendorRequestId } : {}),
  };
}

/** The active version's dubbing output from a node's versions list (null when none is active). */
export function activeDubbingOf(list: { activeVersionId: string | null; versions: { id: string; dubbing: DubbingOutput | null }[] }): DubbingOutput | null {
  return list.versions.find((v) => v.id === list.activeVersionId)?.dubbing ?? null;
}
