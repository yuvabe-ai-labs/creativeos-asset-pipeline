import type { TraceableBrandKB } from "./schema";

// Which KB slices a Script node can inject into the parse context. The catalog is
// the single source of truth shared by the route (validation) and the node UI
// (toggle labels + default-checked state).
export type KBSliceKey =
  | "compliance"
  | "tone_of_voice"
  | "personality"
  | "brand_profile";

export const KB_PARSE_SLICES: {
  key: KBSliceKey;
  label: string;
  default: boolean;
}[] = [
  { key: "compliance", label: "Compliance", default: true },
  { key: "tone_of_voice", label: "Tone", default: true },
  { key: "personality", label: "Personality", default: true },
  { key: "brand_profile", label: "Brand profile", default: false },
];

export const DEFAULT_PARSE_SLICES: KBSliceKey[] = KB_PARSE_SLICES.filter(
  (s) => s.default,
).map((s) => s.key);

const VALID_KEYS = new Set<string>(KB_PARSE_SLICES.map((s) => s.key));

// Validate an arbitrary slice list (e.g. from a request body). Unknown keys are
// dropped; an empty or non-array input falls back to the default set.
export function normalizeSlices(input: unknown): KBSliceKey[] {
  if (!Array.isArray(input)) return [...DEFAULT_PARSE_SLICES];
  const out: KBSliceKey[] = [];
  for (const v of input) {
    if (typeof v === "string" && VALID_KEYS.has(v) && !out.includes(v as KBSliceKey)) {
      out.push(v as KBSliceKey);
    }
  }
  return out.length > 0 ? out : [...DEFAULT_PARSE_SLICES];
}

// ── Rendering ─────────────────────────────────────────────────────────────────

// A KBField's value is string | string[] | null. Flatten to a trimmed string;
// empty / null / empty-array yields "".
function fieldText(field: { value: unknown } | undefined): string {
  const v = field?.value;
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean).join(", ");
  return String(v).trim();
}

function line(label: string, field: { value: unknown } | undefined): string {
  const text = fieldText(field);
  return text ? `${label}: ${text}` : "";
}

// Pure: (active KB + selected slices) -> compact labeled context string.
// Reads only the selected slices; returns "" when nothing is filled.
export function buildParseContext(
  kb: TraceableBrandKB,
  slices: KBSliceKey[],
): string {
  const want = new Set(slices);
  const lines: string[] = [];
  const bp = kb.brand_profile;
  const c = kb.compliance;

  if (want.has("tone_of_voice")) lines.push(line("Tone of voice", bp?.tone_of_voice));
  if (want.has("personality")) lines.push(line("Personality", bp?.personality));
  if (want.has("brand_profile")) {
    lines.push(line("Brand name", bp?.brand_name));
    lines.push(line("Tagline", bp?.tagline));
    lines.push(line("Positioning", bp?.positioning));
    lines.push(line("Mission", bp?.mission));
    lines.push(line("Industry", bp?.industry));
  }
  if (want.has("compliance")) {
    lines.push(line("Avoid words", c?.never_use_words));
    lines.push(line("Avoid claims", c?.never_use_claims));
    lines.push(line("Avoid tone", c?.never_use_tone));
    lines.push(line("Preferred verbs", c?.preferred_verbs));
    lines.push(line("Preferred phrases", c?.preferred_phrases));
    lines.push(line("Disclaimers", c?.disclaimers));
  }

  return lines.filter(Boolean).join("\n");
}
