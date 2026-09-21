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
export const DURATIONS = [5, 8, 10, 12] as const;

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
