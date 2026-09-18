// EXPERIMENT (throwaway) — BytePlus ModelArk Seedream/Seedance probe.
// Not wired into the canvas, DB, or Trigger.dev. See /lab/seedance.

export const ARK_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";

// Model ids confirmed from GET /models on this account (2026-09-18), not from memory.
// `seedream-5-0-260128` is the non-pro ("lite") 5.0 — the only text-to-image model
// whose face-containing output ModelArk trusts as a Seedance input asset.
export const SEEDREAM_MODEL = "seedream-5-0-260128";
export const SEEDANCE_MODEL = "dreamina-seedance-2-5-260628";

// Seedance 2.5 / 2.0 reject directly-uploaded reference images containing real human
// faces. ModelArk trusts three input sources instead; these are the two we can test
// without real-person identity verification.
//   docs.byteplus.com/en/docs/ModelArk/2608626
export const HUMAN_ROUTES = [
  {
    id: "seedream",
    label: "Seedream → Seedance",
    hint: "Generate the presenter with Seedream 5.0, then drive it. Trusted for 30 days, original output only.",
  },
  {
    id: "digital-character",
    label: "Preset digital character",
    hint: "Compliant stock presenter from the digital character library. One call, no 30-day window.",
  },
] as const;

export type HumanRouteId = (typeof HUMAN_ROUTES)[number]["id"];

export const RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export const RATIOS = ["adaptive", "9:16", "16:9", "1:1", "4:3", "3:4", "21:9"] as const;

// Seedance accepts 2–12s; keep the probe cheap by default.
export const DEFAULT_DURATION = 5;

// Terminal task states from the Retrieve-task API.
export const TERMINAL_STATUSES = ["succeeded", "failed", "expired", "cancelled"];

// Output URLs are signed and expire in 24h — the UI must surface this.
export const OUTPUT_URL_TTL_HOURS = 24;
