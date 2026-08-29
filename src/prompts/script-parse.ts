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
            required: [
              "description",
              "duration",
              "duration_seconds",
              "beat_index",
              "beat_label",
            ],
            properties: {
              description: { type: "string" },
              duration: { type: "string" },
              duration_seconds: { type: "integer" },
              beat_index: { type: "integer" },
              beat_label: { type: "string" },
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
- visual_script: { shots: [{ description, duration, duration_seconds, beat_index, beat_label }], execution_refinement }

  A timecoded block in the script ("0-3 SEC — THE HOOK") is a BEAT, and a beat almost always contains SEVERAL SHOTS. Split every beat into its individual shots: one entry per distinct CAMERA SETUP — a new subject, a new angle, or a new location. Do NOT return one entry per timecoded block.

  Worked example. This block:
      0-3 SEC — THE HOOK
      Visual: Rapid close-ups. A young man picks up his keys. A woman steps out of a cab. Someone grabs a coffee. Close-up of CHUPPS hitting the street.
  is FOUR shots, not one — keys, cab, coffee, feet — each with beat_index 0 and beat_label "0-3 SEC — THE HOOK". A 20-second script written in 5 blocks typically yields 15-20 shots.

  - description: what happens in THAT ONE shot. Keep the script's own wording; do not invent detail it does not give.
  - duration: the parent BEAT's timing exactly as the script writes it (e.g. "0-3 sec"). Every shot of one beat repeats the same value.
  - duration_seconds: THIS SHOT's own length in whole seconds, minimum 1.
      First read the BEAT's length from its timing, which is a cumulative range, NOT a length: "0-3 sec" is a 3-second beat, "3-8 sec" is 5 seconds, and "8-14 sec" is 6 seconds. Never use the end of the range as a length.
      Then divide that length across the beat's shots — a 3-second beat with 4 shots is 1 second each. The shots of a beat MAY sum to more than the beat's length; that is expected and correct. Never return a fraction, and never return the beat's whole length on every shot.
  - beat_index: 0-based index of the timecoded block, counting blocks in order from the top of the script. Every shot of one block shares it.
  - beat_label: that block's heading as written (e.g. "0-3 SEC — THE HOOK"). Every shot of one block shares it.

  If the script genuinely describes one shot per block, return one shot per block — but read carefully first: a block listing several subjects or locations is several shots.
- on_screen_text: { intro, body (array of lines), outro }.
- voiceover: the VO script, or "" / "No voiceover".
- music_sound: the music & sound design direction.
- caption: the post caption.
- cta: call to action.
- thumbnail_hook: the thumbnail hook line.
- qc_notes: array of QC / compliance notes.
- product_links: array of product URLs in the script.`;

export const scriptParsePrompt = {
  id: "script-parse",
  version: 3,
  model: "gpt-5.4-mini",
  system,
  schema: reelSchema,
  notes:
    "Reel schema = structure of a finished reel script (Prakriti Sattva 53-reel scripts). " +
    "See docs/context-refs/prakriti-sattva-selection-rationale.md.",
};
