// NO `server-only` import — this module is read by BOTH providers/gemini-omni.ts (server) and
// client-models.ts (bundled into client components).
//
// Veo and Kling hand-copy their imageInputs and rules into client-models.ts because their
// constants live in `server-only` provider files. That makes two copies of one fact, and the API
// route caps referenceUrls against the CLIENT copy while the provider is built from the SERVER
// copy — so a drift between them silently changes what gets sent. One shared module removes the
// class of bug rather than adding a third copy of it.
import type { ConstraintRule } from "./types";

/**
 * 6 is the highest reference count Google's own documented example demonstrates. It is NOT a
 * stated maximum — the docs cap video references at 3 but say nothing about image references.
 * Treat it as a conservative floor to revise upward with evidence, not as a published limit.
 *
 * Unlike Veo, frames and references are NOT mutually exclusive on Omni: no rule pins duration or
 * disables a slot when the other is in use.
 */
export const GEMINI_OMNI_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 6,
} as const;

export const GEMINI_OMNI_RULES: ConstraintRule[] = [
  {
    id: "omni-last-frame-needs-first-frame",
    when: {
      op: "and",
      conditions: [
        { field: "hasEndFrame", op: "eq", value: true },
        { field: "hasStartFrame", op: "eq", value: false },
      ],
    },
    effect: { disableGenerate: true },
    // Leads with the consequence rather than the tag names — an operator reads the panel, not
    // the API docs. Matches the phrasing of Veo Lite's end-frame-requires-start-frame rule.
    reason: "End frame needs a start frame — <LAST_FRAME> requires <FIRST_FRAME>",
  },
];
