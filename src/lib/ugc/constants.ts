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

export type BenchSettings = {
  model: SeedanceModelId;
  resolution: (typeof RESOLUTIONS)[number];
  duration: number;
  ratio: (typeof RATIOS)[number];
};

export const DEFAULT_SETTINGS: BenchSettings = {
  model: "dreamina-seedance-2-5-260628",
  resolution: "720p",
  duration: 5,
  ratio: "9:16",
};

export const TERMINAL_STATUSES = ["succeeded", "failed", "expired", "cancelled"];
export const MAX_CONCURRENT = 3;
export const POLL_MS = 5000;
// ~80s per clip in the spike; 90 × 5s = 7.5 min headroom.
export const MAX_POLLS = 90;
