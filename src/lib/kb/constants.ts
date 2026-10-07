import type { ModuleKey } from "./types";
import type { ClientKBJobStatus } from "@/lib/db/types";

export const KB_DOC_SIZE_LIMIT_BYTES = 20 * 1024 * 1024; // 20 MB per client
export const KB_IMG_SIZE_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MB per client (OpenAI Vision limit)
export const KB_DOC_PER_FILE_LIMIT_BYTES = 1 * 1024 * 1024; // 1 MB — OpenAI input_file API limit

export const KB_JOB_NON_TERMINAL_STATUSES: ClientKBJobStatus[] = [
  "queued", "researching", "extracting", "finalizing",
];
export const KB_JOB_NON_TERMINAL = new Set<ClientKBJobStatus>(KB_JOB_NON_TERMINAL_STATUSES);

/** Fields whose values are brand colours (a name plus hex code). They render as swatches. */
export const COLOUR_FIELD_KEYS: ReadonlySet<string> = new Set([
  "colour_palette_primary",
  "colour_palette_secondary",
  "colour_palette_avoid",
  "dominant_colors",
]);

/** Fields shown first in a module, in this order, whatever order the stored KB has them in.
 *  Visual Identity leads with the palette — the part people look for first. */
export const MODULE_LEADING_FIELDS: Partial<Record<ModuleKey, readonly string[]>> = {
  visual_identity: ["colour_palette_primary", "colour_palette_secondary", "colour_palette_avoid"],
  // The tallied fields first, then the look, then how people and text appear (D312).
  image_analysis: [
    "content_mix",
    "purpose_mix",
    "dominant_colors",
    "aesthetic",
    "visual_mood",
    "subjects",
    "product_presentation",
    "composition_style",
    "lighting_character",
    "settings_backgrounds",
    "people_casting",
    "text_overlay_style",
    "recurring_motifs",
    "brand_consistency_notes",
  ],
};

export const MODULES: { key: ModuleKey; label: string }[] = [
  { key: "brand_voice",      label: "Brand Voice" },
  { key: "visual_identity",  label: "Visual Identity" },
  { key: "image_analysis",   label: "Image Analysis" },
  { key: "audience_casting", label: "Audience & Casting" },
  { key: "image_direction",  label: "Image Direction" },
  { key: "video_direction",  label: "Video Direction" },
  { key: "compliance",       label: "Compliance Rules" },
];

export const FIELD_LABELS: Record<string, string> = {
  brand_name: "Brand Name",
  tagline: "Tagline",
  positioning: "Positioning",
  mission: "Mission",
  personality: "Personality",
  tone_of_voice: "Tone of Voice",
  industry: "Industry",
  aesthetic: "Aesthetic",
  photography_style: "Photography Style",
  colour_palette_primary: "Primary Colours",
  colour_palette_secondary: "Secondary Colours",
  colour_palette_avoid: "Colours to Avoid",
  surface_palette: "Surface / Textures",
  lighting: "Lighting",
  visual_mood: "Visual Mood",
  visual_benchmark: "Visual Benchmarks",
  typography_style: "Typography Style",
  dominant_colors: "Dominant Colours",
  composition_style: "Composition Style",
  lighting_character: "Lighting Character",
  brand_consistency_notes: "Consistency Notes",
  subjects: "Subjects",
  content_mix: "Format Mix",
  purpose_mix: "Purpose Mix",
  product_presentation: "Product Presentation",
  settings_backgrounds: "Settings & Backgrounds",
  people_casting: "People & Casting",
  text_overlay_style: "Text Overlay Style",
  recurring_motifs: "Recurring Motifs",
  age_range: "Age Range",
  gender: "Gender",
  location: "Location",
  lifestyle: "Lifestyle",
  pain_points: "Pain Points",
  desires: "Desires",
  human_casting: "Human Casting",
  shot_style: "Shot Style",
  composition: "Composition",
  environment: "Environment",
  feel: "Feel",
  motion_style: "Motion Style",
  camera_movement: "Camera Movement",
  transition_style: "Transition Style",
  atmosphere: "Atmosphere",
  pacing: "Pacing",
  text_system: "Text System",
  music_direction: "Music Direction",
  preferred_verbs: "Preferred Verbs",
  preferred_phrases: "Preferred Phrases",
  never_use_words: "Never Use Words",
  never_use_claims: "Never Use Claims",
  never_use_tone: "Never Use Tone",
  disclaimers: "Disclaimers",
};

export const DOC_EXTENSIONS = new Set(["pdf", "docx", "pptx", "md", "txt"]);
export const IMG_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
