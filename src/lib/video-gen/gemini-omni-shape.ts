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
 * D428 — measured against the live API on 2026-10-29, numbered cards checked frame by frame.
 *
 * References alone: the API accepted 32, but only up to 12 rendered every card correctly (16 had
 * one wrong, 24 and 32 many). So 12.
 *
 * With frames, quality falls apart above 7 images in all: start + 6 refs and start + end + 4 refs
 * kept their frames and every card; start + end + 6, start + 9 and start + end + 10 opened on the
 * wrong frame and dropped cards. So 7 in all, and the reference cap shrinks by one per frame
 * (referenceCapFor).
 *
 * Unlike Veo, frames and references are NOT mutually exclusive on Omni: no rule pins duration or
 * disables a slot when the other is in use.
 */
export const GEMINI_OMNI_IMAGE_INPUTS = {
  startFrame: true,
  endFrame: true,
  maxReferenceImages: 12,
  maxImagesWithFrames: 7,
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
