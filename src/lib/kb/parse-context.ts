import type { TraceableBrandKB } from "./schema";

// Which KB slices a node can inject into the parse context. The catalog is
// the single source of truth shared by the route (validation) and the node UI
// (toggle labels + default-checked state).
export type KBSliceKey =
  | "compliance"
  | "tone_of_voice"
  | "personality"
  | "brand_profile"
  | "visual_identity"
  | "image_direction"
  | "casting";

export const KB_PARSE_SLICES: {
  key: KBSliceKey;
  label: string;
  default: boolean;
}[] = [
  { key: "visual_identity", label: "Visual Style",    default: true },
  { key: "image_direction", label: "Image Direction", default: true },
  { key: "casting",         label: "Casting",         default: true },
  { key: "personality",     label: "Personality",     default: true },
  { key: "tone_of_voice",   label: "Tone",            default: true },
  { key: "brand_profile",   label: "Brand profile",   default: false },
  { key: "compliance",      label: "Compliance",      default: true },
];

// Script-node default: compliance, tone, personality. Brand profile is OFF by
// default (ADR D17 / AGENTS.md) — toggle it on per-node when needed.
export const DEFAULT_PARSE_SLICES: KBSliceKey[] = [
  "compliance", "tone_of_voice", "personality",
];

// Prompt-node default: all image-generation relevant slices.
export const DEFAULT_IMAGE_PROMPT_SLICES: KBSliceKey[] = KB_PARSE_SLICES.map(s => s.key);

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
  if (want.has("visual_identity")) {
    const vi = kb.visual_identity;
    lines.push(line("Aesthetic", vi?.aesthetic));
    lines.push(line("Photography style", vi?.photography_style));
    lines.push(line("Primary colours", vi?.colour_palette_primary));
    lines.push(line("Avoid colours", vi?.colour_palette_avoid));
    lines.push(line("Surfaces", vi?.surface_palette));
    lines.push(line("Lighting", vi?.lighting));
    lines.push(line("Visual mood", vi?.visual_mood));
  }
  if (want.has("image_direction")) {
    const img = kb.creative_direction?.image;
    lines.push(line("Shot style", img?.shot_style));
    lines.push(line("Composition", img?.composition));
    lines.push(line("Environment", img?.environment));
    lines.push(line("Subjects", img?.subjects));
    lines.push(line("Feel", img?.feel));
  }
  if (want.has("casting")) {
    const ta = kb.target_audience;
    lines.push(line("Human casting", ta?.human_casting));
    lines.push(line("Audience lifestyle", ta?.lifestyle));
  }

  return lines.filter(Boolean).join("\n");
}
