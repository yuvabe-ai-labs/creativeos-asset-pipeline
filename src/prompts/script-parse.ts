// Script-parse prompt — a single, evaluable, *versioned* record.
//
// Kept here (not inlined in route/compile logic) so the prompt + schema can be
// iterated and evaluated on their own, and later moved to a `prompts` DB table.
// This object maps 1:1 to a future row: { id, version, model, system, schema, notes }.
//
// The reel schema is the structure of a FINISHED reel script (see the Prakriti
// Sattva 53-reel scripts). The Script node EXTRACTS that structure from a script
// the designer already has — it does not invent it.
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
            required: ["description", "duration", "duration_seconds"],
            properties: {
              description: { type: "string" },
              duration: { type: "string" },
              duration_seconds: { type: "integer" },
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

const system = `You extract the structure of a FINISHED short-form video REEL SCRIPT into a single JSON object.

Rules:
- The input is an already-written reel script. EXTRACT what is present — do NOT invent. Use empty strings or empty arrays only when a field is genuinely absent from the script.
- Respect the client context provided with the script: keep the brand tone, and never introduce medical/claim words the client avoids (e.g. cure, heal, treat, repair, prevent) or before/after promises.

Fields:
- title: the reel's title / hook line.
- type: "VISUAL" | "VO" | "TEXT" (read from the script's tag; "" if unclear).
- duration: e.g. "22-26 seconds".
- schedule: { date, post_time, category, theme }.
- strategic_objective: the stated goal of the reel.
- ai_production_type: the production approach stated in the script.
- visual_script: { shots: [{ description, duration, duration_seconds }], execution_refinement } — split the shot list into individual shots.
  - duration: the timing exactly as the script writes it (e.g. "0-3 sec", "3-8 sec").
  - duration_seconds: that shot's OWN LENGTH in whole seconds — NOT the end of its timecode range. Scripts usually write cumulative ranges, so "0-3 sec" is 3, "3-8 sec" is 5, and "8-14 sec" is 6. If a shot gives only a single number ("4 sec"), that number IS the length. If the length cannot be determined, use 4.
- on_screen_text: { intro, body (array of lines), outro }.
- voiceover: the VO script, or "" / "No voiceover".
- music_sound: the music & sound design direction.
- caption: the post caption.
- cta: call to action.
- thumbnail_hook: the thumbnail hook line.
- qc_notes: array of QC / compliance notes.
- product_links: array of product URLs in the script.`;

// D204: how attached market signals reshape the parse. Composed into the USER
// message by compileScript (after the signal briefs, before the source script).
const signalModes = {
  tint: `Market-signal instruction (TINT VISUALS): keep the voiceover, on-screen text, caption and CTA faithful to the source script. Adapt ONLY the visual side — shot descriptions, settings, props, wardrobe and moods — so every shot reflects the market signal(s) above.`,
  rewrite: `Market-signal instruction (FULL REWRITE): adapt the whole script — hooks, voiceover, on-screen text, caption AND visuals — to the market signal(s) above, while keeping the product message and the client compliance rules intact.`,
} as const;

export const scriptParsePrompt = {
  id: "script-parse",
  // v2 was bumped twice in parallel — for per-shot duration_seconds (D214) on one
  // branch, for market-signal briefs (D204) on the other. The merged prompt carries
  // both, so it is neither v2 and gets its own number.
  version: 3,
  model: "gpt-5.4-mini",
  system,
  signalModes,
  schema: reelSchema,
  notes:
    "Reel schema = structure of a finished reel script (Prakriti Sattva 53-reel scripts). " +
    "See docs/context-refs/prakriti-sattva-selection-rationale.md.",
};
