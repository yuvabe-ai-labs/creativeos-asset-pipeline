// UGC bench — BytePlus ModelArk (Seedream → Seedance). Test tool, session only.
// Model ids confirmed from GET /api/v3/models on this account (2026-09-18), not the docs.

export const ARK_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";

// The only text-to-image model whose face output Seedance trusts as a reference.
export const SEEDREAM_MODEL = "seedream-5-0-260128";

export const SEEDANCE_MODELS = [
  { id: "dreamina-seedance-2-5-260628", label: "Seedance 2.5" },
  { id: "dreamina-seedance-2-0-260128", label: "Seedance 2.0" },
  { id: "dreamina-seedance-2-0-fast-260128", label: "Seedance 2.0 fast" },
] as const;
export type SeedanceModelId = (typeof SEEDANCE_MODELS)[number]["id"];

export const RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export const RATIOS = ["adaptive", "9:16", "16:9", "1:1", "3:4", "4:3"] as const;
// Seedance 2.5 generates 4–30s in one call; a beat may be one call or two.
export const DURATIONS = [4, 5, 8, 10, 12, 15, 20, 25, 30] as const;

// reference_audio limits (Seedance 2.5): wav/mp3, each clip 2–30s.
export const VOICE_MIN_SECONDS = 2;
export const VOICE_MAX_SECONDS = 30;

// Gemini Omni 1.1 Flash — the product's own provider (src/lib/video-gen/providers/gemini-omni.ts)
// carries the hard-won request shape; these are its limits. Probed 2026-09-23: it takes a
// Seedream face as a plain reference (no trusted-output rule — that is a BytePlus concept),
// answers synchronously in ~26s, and returns h264 + AAC.
export const OMNI_MODEL = "gemini-omni-1.1-flash";
export const OMNI_RESOLUTIONS = ["360p", "720p", "1080p", "4k"] as const;
export const OMNI_RATIOS = ["9:16", "16:9"] as const;
export const OMNI_DURATIONS = [3, 5, 8, 10] as const;

export type Engine = "seedance" | "omni";

export const ENGINES = [
  {
    id: "seedance",
    label: "Seedance",
    blurb: "BytePlus · 4–30s · voice anchor · ~90s per clip",
    resolutions: RESOLUTIONS,
    ratios: RATIOS,
    durations: DURATIONS,
    supportsVoice: true,
    // BytePlus rejects uploaded reference images containing real human faces outright.
    supportsUploadedFace: false,
  },
  {
    id: "omni",
    label: "Gemini Omni",
    blurb: "Google · 3–10s · no voice reference · ~30s per clip",
    resolutions: OMNI_RESOLUTIONS,
    ratios: OMNI_RATIOS,
    durations: OMNI_DURATIONS,
    supportsVoice: false,
    // Google has no trusted-output rule, so a photo can be sent straight in. Its own safety
    // filter still decides: likenesses of real people are often refused, and that refusal is
    // shown as-is.
    supportsUploadedFace: true,
  },
] as const;

export function engineConfig(engine: Engine) {
  return ENGINES.find((e) => e.id === engine)!;
}

export type BenchSettings = {
  model: SeedanceModelId;
  resolution: string;
  duration: number;
  ratio: string;
};

export const DEFAULT_SETTINGS: BenchSettings = {
  model: "dreamina-seedance-2-5-260628",
  resolution: "720p",
  duration: 5,
  ratio: "9:16",
};

// Omni's cheapest useful tier ($0.03/s at 360p) — this is a bench, not a render farm.
export const DEFAULT_OMNI_SETTINGS: BenchSettings = {
  model: "dreamina-seedance-2-5-260628", // unused by Omni; keeps one settings shape
  resolution: "360p",
  duration: 5,
  ratio: "9:16",
};

export function defaultSettings(engine: Engine): BenchSettings {
  return engine === "omni" ? DEFAULT_OMNI_SETTINGS : DEFAULT_SETTINGS;
}

// The uploaded photo travels inline as a data URL through our own route; base64 inflates by
// ~33%, so this keeps a request under Vercel's 4.5 MB cap.
export const FACE_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;

export const TERMINAL_STATUSES = ["succeeded", "failed", "expired", "cancelled"];
export const MAX_CONCURRENT = 3;
export const POLL_MS = 5000;
// ~80s per clip in the spike; 90 × 5s = 7.5 min headroom.
export const MAX_POLLS = 90;
