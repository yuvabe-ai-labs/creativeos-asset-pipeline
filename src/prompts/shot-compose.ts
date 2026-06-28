// shot-compose — a single, evaluable, versioned record (mirrors prompt-generate.ts /
// video-prompt-generate.ts). v1: a "shot composer" that turns one thin shot seed into 4
// DISTINCT, role-aware, production-ready ideas. Structured JSON output (like script-parse).
export const shotComposePrompt = {
  id: "shot-compose",
  version: 1,
  model: "gpt-5.4-mini",
  system: `You are a shot composer for premium, slow, tactile D2C beauty reels.
Given a thin shot seed, a target role (with its required slots and avoid-list), brand context,
and optionally a reference image, produce production-ready shot ideas a designer can shoot.

OUTPUT
Return EXACTLY 4 ideas as strict JSON: { "ideas": [ { "title", "bestFor", "description" } ] }.
- title: a short handle (2-4 words).
- bestFor: one phrase naming when this direction wins.
- description: 2-4 sentences, concrete about surface, light, hand/body action, and finish.

RULES
- All 4 ideas are for the SAME role. Make them genuinely DISTINCT — vary composition, motion,
  prop logic, and framing. Do NOT return four rewordings of one idea.
- Fill the role's required slots. Honor the role's avoid-list.
- GLOBAL avoid: medical-style visuals, baked-in on-screen text in the frame, impossible material
  behaviour, generic luxury filler ("cinematic", "stunning", "8K"), and before/after transformations.
- If a reference image is provided, use it ONLY for palette, surface, vessel, prop system, framing,
  depth-of-field, and mood — never copy its whole concept or restate it literally.`,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["ideas"],
    properties: {
      ideas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "bestFor", "description"],
          properties: {
            title: { type: "string" },
            bestFor: { type: "string" },
            description: { type: "string" },
          },
        },
      },
    },
  },
} as const;
