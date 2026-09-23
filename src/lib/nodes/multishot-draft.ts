// D280 — the Multishot focus view's buffered edits, as data.
//
// Pure (no React) so it is unit testable and the sheet stays a thin presentational shell — the
// same reasoning `delete-confirm.ts` records, and the only option available here: this repo runs
// vitest with `environment: "node"` and has neither jsdom nor @testing-library, so component
// rendering cannot be asserted.
//
// The cut ladder and the target model are ONE draft. The model governs the ceiling every slider
// is measured against, so a model that wrote through while the cuts were buffered would
// re-measure the draft against a ceiling Cancel could not put back.
import { totalOf, type MultishotCut } from "./multishot-cuts";

export type MultishotDraft = {
  cuts: MultishotCut[];
  /** Absent = the default (Gemini Omni), exactly as on MultishotNodeData. */
  targetModel?: string;
};

/**
 * Has the operator edited the ladder since the sheet opened or was last saved?
 *
 * `JSON.stringify`, matching `script-focus-view.tsx` — and deliberately NOT the field-wise
 * comparison `planIsDirty` uses. That function avoids stringify because it compares two
 * independently CONSTRUCTED objects (a server's plan against a client's), where key order and
 * later-added fields make stringify lie. Both sides here descend from the same stored object by
 * structural edits, so key order is stable by construction.
 *
 * Stringify is also what keeps `voiceover: undefined` distinguishable from `voiceover: []` — an
 * absent key and an empty array do not serialise alike — which is a distinction this module
 * maintains everywhere else (see `cutsFromShots`).
 */
export function draftIsDirty(saved: MultishotDraft, draft: MultishotDraft): boolean {
  return JSON.stringify(saved) !== JSON.stringify(draft);
}

/**
 * The node data patch a Save writes — ONE object, passed to a single `updateNodeData` call.
 *
 * `totalSeconds` is the stored mirror of the ladder's own length, and `canvas-nodes.ts` requires
 * every writer of `cuts` to write it in the same call. Returning both from one function is what
 * makes forgetting it structurally impossible rather than a rule to remember.
 *
 * NOT clamped into the model's window (D237): a ladder outside it keeps its real length and
 * `checkLadder` states the violation. Clamping here would make the card read "10s" over a red
 * line saying "14s · Gemini Omni 1.1 allows 10s" — two numbers for one ladder.
 */
export function commitDraft(draft: MultishotDraft): {
  cuts: MultishotCut[];
  totalSeconds: number;
  targetModel?: string;
} {
  return {
    cuts: draft.cuts,
    totalSeconds: totalOf(draft.cuts),
    // Spread rather than assigned: writing `targetModel: undefined` would put the key on the
    // patch and clear a model the operator never touched.
    ...(draft.targetModel !== undefined ? { targetModel: draft.targetModel } : {}),
  };
}
