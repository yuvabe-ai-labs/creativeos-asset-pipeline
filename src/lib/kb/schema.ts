import { z } from "zod";

// ── KBField wrapper ───────────────────────────────────────────────────────────
// Every leaf in the KB is wrapped with provenance + review status so users can
// approve, edit, or reject each extracted value individually.

function kbField<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    value: schema.nullable(),
    confidence: z
      .enum(["high", "medium", "low"])
      .describe("high = clearly stated, medium = general statement, low = inferred"),
    evidence_type: z
      .enum(["explicit", "inferred"])
      .describe("explicit = stated directly; inferred = derived from context"),
    status: z
      .enum(["needs_review", "approved", "edited", "rejected"])
      .describe("Always output 'needs_review' — never any other value"),
  });
}

export type KBFieldStatus = "needs_review" | "approved" | "edited" | "rejected";

export type KBField<T = string> = {
  value: T | null;
  confidence: "high" | "medium" | "low";
  evidence_type: "explicit" | "inferred";
  status: KBFieldStatus;
};

// ── Brand Profile ─────────────────────────────────────────────────────────────

export const TraceableBrandProfileSchema = z.object({
  brand_name: kbField(z.string()).describe("Full brand name"),
  tagline: kbField(z.string()).describe("Brand tagline or campaign line"),
  positioning: kbField(z.string()).describe(
    "One-liner: who it's for, what it does, why different",
  ),
  mission: kbField(z.string()).describe("What the brand exists to do"),
  personality: kbField(z.array(z.string())).describe(
    "Adjectives only: warm, premium, educational, etc.",
  ),
  tone_of_voice: kbField(z.string()).describe(
    "How it sounds: poetic, clinical, conversational, etc.",
  ),
  industry: kbField(z.string()).describe(
    "beauty / F&B / fashion / tech / wellness / etc.",
  ),
});

// ── Visual Identity ───────────────────────────────────────────────────────────
// colour_palette is flattened (no nested sub-object) so every field is a KBField.

export const TraceableVisualIdentitySchema = z.object({
  aesthetic: kbField(z.string()).describe(
    "Overall visual feel: warm earthy artisanal, clean minimalist, etc.",
  ),
  photography_style: kbField(z.string()).describe(
    "Macro, editorial, lifestyle, flat lay, etc.",
  ),
  colour_palette_primary: kbField(z.array(z.string())).describe(
    "Main brand colours — always include hex codes: 'turmeric gold #C8A000'",
  ),
  colour_palette_secondary: kbField(z.array(z.string())).describe(
    "Supporting colours with hex codes where available",
  ),
  colour_palette_avoid: kbField(z.array(z.string())).describe(
    "Colours explicitly prohibited by the brand",
  ),
  surface_palette: kbField(z.array(z.string())).describe(
    "Physical textures and props: wood, linen, stone, clay, aged terracotta",
  ),
  lighting: kbField(z.string()).describe(
    "Golden hour, natural diffused, softbox, harsh, etc.",
  ),
  visual_mood: kbField(z.string()).describe("Emotional register of the visuals"),
  visual_benchmark: kbField(z.array(z.string())).describe(
    "Brands with comparable visual aesthetic — NOT competitors",
  ),
  typography_style: kbField(z.string()).describe(
    "Clean/minimal, large serif, bold sans, spacious lowercase, etc.",
  ),
});

// ── Target Audience ───────────────────────────────────────────────────────────

export const TraceableTargetAudienceSchema = z.object({
  age_range: kbField(z.string()).describe("Primary age band"),
  gender: kbField(z.string()).describe("women-primary / men / unisex"),
  location: kbField(z.string()).describe("Geography focus"),
  lifestyle: kbField(z.string()).describe("How they live and what they value"),
  pain_points: kbField(z.array(z.string())).describe(
    "Problems they're trying to solve",
  ),
  desires: kbField(z.array(z.string())).describe("What they want from the brand"),
  human_casting: kbField(z.string()).describe(
    "CRITICAL for AI image generation: describe people in brand imagery — age, skin tone, styling, emotional state",
  ),
});

// ── Creative Direction ────────────────────────────────────────────────────────

export const TraceableImageDirectionSchema = z.object({
  shot_style: kbField(z.string()).describe(
    "Macro, wide, portrait, overhead, process shot",
  ),
  composition: kbField(z.string()).describe(
    "Rule of thirds, negative space, flat lay, centred product, close crop",
  ),
  environment: kbField(z.string()).describe(
    "Studio, in-home kitchen, outdoor forest, indoor spa, neutral void",
  ),
  subjects: kbField(z.string()).describe(
    "What to show: hands, product only, ingredient close-up, person + product",
  ),
  feel: kbField(z.string()).describe(
    "Emotional register: cinematic, tactile, serene, luxurious",
  ),
});

export const TraceableVideoDirectionSchema = z.object({
  motion_style: kbField(z.string()).describe(
    "How elements move: subtle drift, slow bloom, dynamic burst",
  ),
  camera_movement: kbField(z.string()).describe(
    "Pan, zoom in/out, orbital, static hold, handheld",
  ),
  transition_style: kbField(z.string()).describe(
    "Hard cut, dissolve, morph, match cut",
  ),
  atmosphere: kbField(z.string()).describe(
    "Overall mood: meditative calm, playful energy, cinematic tension",
  ),
  pacing: kbField(z.string()).describe(
    "Slow and meditative, punchy, rhythmic, breath-like",
  ),
  text_system: kbField(z.string()).describe(
    "INTRO: hook / BODY: one idea / OUTRO: product + CTA",
  ),
  music_direction: kbField(z.string()).describe(
    "Genre, tempo, energy, instruments — and what to avoid",
  ),
});

// ── Compliance ────────────────────────────────────────────────────────────────

export const TraceableComplianceSchema = z.object({
  preferred_verbs: kbField(z.array(z.string())).describe(
    "Verbs the AI should default to: helps, supports, nourishes",
  ),
  preferred_phrases: kbField(z.array(z.string())).describe(
    "Brand-approved language patterns",
  ),
  never_use_words: kbField(z.array(z.string())).describe(
    "Hard-blocked words — ALL inflections: heals, healed, healing, healer",
  ),
  never_use_claims: kbField(z.array(z.string())).describe(
    "Blocked claim patterns: guaranteed results, clinically proven to cure",
  ),
  never_use_tone: kbField(z.array(z.string())).describe(
    "Tone violations: hype language, aggressive urgency",
  ),
  disclaimers: kbField(z.array(z.string())).describe(
    "Legal lines: results may vary, for external use only",
  ),
});

// ── Image Analysis (from brand image uploads) ─────────────────────────────────

export const ImageAnalysisSchema = z.object({
  dominant_colors: kbField(z.array(z.string())).describe(
    "Most prominent colours observed across images, with hex estimates where possible",
  ),
  visual_mood: kbField(z.string()).describe(
    "Emotional atmosphere conveyed by the images",
  ),
  aesthetic: kbField(z.string()).describe(
    "Overall visual aesthetic observed: earthy, minimal, bold, etc.",
  ),
  subjects: kbField(z.string()).describe(
    "What is typically photographed: product, people, ingredients, environments",
  ),
  composition_style: kbField(z.string()).describe(
    "Common compositional patterns: flat lay, close crop, negative space, etc.",
  ),
  lighting_character: kbField(z.string()).describe(
    "Lighting style observed: natural, golden, harsh, soft diffused, etc.",
  ),
  brand_consistency_notes: kbField(z.string()).describe(
    "Notes on visual consistency or standout patterns across the image set",
  ),
});

// ── Root ──────────────────────────────────────────────────────────────────────

export const TraceableBrandKBSchema = z.object({
  brand: kbField(z.string()).describe("Brand name"),
  brand_profile: TraceableBrandProfileSchema,
  visual_identity: TraceableVisualIdentitySchema,
  target_audience: TraceableTargetAudienceSchema,
  creative_direction: z.object({
    image: TraceableImageDirectionSchema,
    video: TraceableVideoDirectionSchema,
  }),
  compliance: TraceableComplianceSchema,
  image_analysis: ImageAnalysisSchema,
});

export type TraceableBrandKB = z.infer<typeof TraceableBrandKBSchema>;
