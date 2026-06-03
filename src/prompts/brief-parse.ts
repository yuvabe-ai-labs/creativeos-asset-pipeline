// Brief-parse prompt — a single, evaluable, *versioned* record.
//
// Kept here (not inlined in route/compile logic) so the prompt + schema can be
// iterated and evaluated on their own, and later moved to a `prompts` DB table.
// This object maps 1:1 to a future row: { id, version, model, system, schema, notes }.
//
// The reel schema is derived from the real Prakriti Sattva 53-reel scripts. The
// "why" of each field + KB choice lives in:
//   docs/context-refs/prakriti-sattva-selection-rationale.md

// JSON Schema for OpenAI structured outputs (strict mode → guaranteed shape).
// strict requires: every property in `required`, and additionalProperties:false.
const reelSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "type",
    "duration",
    "schedule",
    "strategic_objective",
    "ai_production_type",
    "visual_script",
    "on_screen_text",
    "voiceover",
    "music_sound",
    "caption",
    "cta",
    "thumbnail_hook",
    "qc_notes",
    "product_links",
  ],
  properties: {
    title: { type: "string" },
    type: { type: "string", enum: ["VISUAL", "VO", "TEXT", ""] },
    duration: { type: "string" },
    schedule: {
      type: "object",
      additionalProperties: false,
      required: ["date", "post_time", "category", "theme"],
      properties: {
        date: { type: "string" },
        post_time: { type: "string" },
        category: { type: "string" },
        theme: { type: "string" },
      },
    },
    strategic_objective: { type: "string" },
    ai_production_type: { type: "string" },
    visual_script: {
      type: "object",
      additionalProperties: false,
      required: ["shots", "execution_refinement"],
      properties: {
        shots: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["description", "duration"],
            properties: {
              description: { type: "string" },
              duration: { type: "string" },
            },
          },
        },
        execution_refinement: { type: "string" },
      },
    },
    on_screen_text: {
      type: "object",
      additionalProperties: false,
      required: ["intro", "body", "outro"],
      properties: {
        intro: { type: "string" },
        body: { type: "array", items: { type: "string" } },
        outro: { type: "string" },
      },
    },
    voiceover: { type: "string" },
    music_sound: { type: "string" },
    caption: { type: "string" },
    cta: { type: "string" },
    thumbnail_hook: { type: "string" },
    qc_notes: { type: "array", items: { type: "string" } },
    product_links: { type: "array", items: { type: "string" } },
  },
} satisfies Record<string, unknown>;

const system = `You parse a creative REEL brief into a single structured JSON object describing one short-form video reel.

Rules:
- Extract only what the brief states. Do NOT invent facts. Use empty strings or empty arrays for anything absent.
- Respect the client context provided with the brief: match the brand tone and visual direction.
- COMPLIANCE: never use medical/claim words the client says to avoid (e.g. cure, heal, treat, repair, prevent) and never make before/after promises. Prefer compliant verbs: helps, supports, nourishes, comforts, designed for.

Fields:
- title: the reel's title / hook line.
- type: "VISUAL" | "VO" | "TEXT" (or "" if unclear).
- duration: e.g. "22-26 seconds".
- schedule: { date, post_time, category, theme }.
- strategic_objective: the goal of the reel.
- ai_production_type: how it is produced (e.g. "product composite + AI macro ingredients + cinematic still holds").
- visual_script: { shots: [{ description, duration }], execution_refinement }.
- on_screen_text: { intro, body (array of lines), outro }.
- voiceover: VO script, or "" / "No voiceover".
- music_sound: music & sound design direction.
- caption: the post caption.
- cta: call to action.
- thumbnail_hook: the thumbnail hook line.
- qc_notes: array of QC / compliance notes.
- product_links: array of product URLs mentioned in the brief.`;

export const briefParsePrompt = {
  id: "brief-parse",
  version: 1,
  model: "gpt-4o-mini",
  system,
  schema: reelSchema,
  notes:
    "Reel schema derived from the Prakriti Sattva 53-reel scripts structure. " +
    "See docs/context-refs/prakriti-sattva-selection-rationale.md.",
};
