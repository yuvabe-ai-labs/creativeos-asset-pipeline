// D235 — what each multishot model allows. This table replaces OMNI_MAX_SECONDS as the cut
// ladder's ceiling.
//
// One constant could describe one model. Kling 3.0 Omni allows 15s where Omni allows 10, caps
// cuts at 6 where Omni states no limit, and caps a beat at 512 characters where Omni states
// nothing — so the ceiling became a lookup.
//
// `null` means THE VENDOR STATES NO LIMIT, and is deliberately not a large sentinel number: a
// limit we invented and a limit they published must not be indistinguishable at the call site.
//
// NOT parameterised by this table: `group-shots.ts`. Fan-out packing runs when a script is parsed,
// before any Multishot node exists and therefore before a model is chosen. It keeps packing to
// Omni's 10s, which is the safe floor — a group that fits Omni also fits Kling, so switching a
// node to Kling afterwards only ever grants headroom.
import {
  GEMINI_OMNI_MODEL_ID,
  KLING_OMNI_MODEL_ID,
  SEEDANCE_MODEL_ID,
} from "@/lib/video-gen/client-models";

export type MultishotCapability = {
  /** A video-gen client model id. Video Gen generates the ladder on exactly this model. */
  id: string;
  /** Operator-facing, and the name the restriction sentence uses. */
  label: string;
  minTotalSeconds: number;
  maxTotalSeconds: number;
  minCutSeconds: number;
  /** Hard cap on cuts per generation. `null` = no limit the vendor states. */
  maxCuts: number | null;
  /** Per-beat and whole-prompt character ceilings. `null` = none stated. */
  maxCutChars: number | null;
  maxPromptChars: number | null;
  /**
   * How `renderPlan` lays the beats out (D238, D244).
   *   timecode      — `[0-2s] …` cumulative ladder (Gemini Omni)
   *   triple        — `shot n, m, words;` (Kling's API format, NOT its console syntax)
   *   bare-timecode — `0-2s: …` (Seedance 2.5's own tutorial format)
   */
  shotFormat: "timecode" | "triple" | "bare-timecode";
  /**
   * Which reference-token dialect a beat's citations are stored in (D245).
   *
   * NAMED, not derived from `refTokenBase`. Kling's `@image_1` and Seedance's `@Image 1` are BOTH
   * 1-based, so the numeric base no longer identifies a dialect — and those two shapes differ by
   * one character's case and a space, which is exactly the near-collision that binds a citation to
   * the wrong image silently, in a clip already paid for.
   */
  refTokenDialect: "image-ref" | "kling-image" | "seedance-image";
  /**
   * First index a reference token carries: `<IMAGE_REF_0>` vs `@image_1`.
   *
   * Currently retained for context but has no production reader — `refsCitedIn` hardcodes the
   * offset per dialect branch and does not consult this field. Retained for now because removing
   * it is a wider change across the type, three entries and their tests, and is the final
   * whole-branch review's call.
   */
  refTokenBase: 0 | 1;
};

export const MULTISHOT_MODELS: MultishotCapability[] = [
  {
    id: GEMINI_OMNI_MODEL_ID,
    label: "Gemini Omni 1.1",
    minTotalSeconds: 3,
    maxTotalSeconds: 10,
    minCutSeconds: 1,
    maxCuts: null,
    maxCutChars: null,
    maxPromptChars: null,
    shotFormat: "timecode",
    refTokenDialect: "image-ref",
    refTokenBase: 0,
  },
  {
    id: KLING_OMNI_MODEL_ID,
    label: "Kling 3.0 Omni",
    minTotalSeconds: 3,
    maxTotalSeconds: 15,
    minCutSeconds: 1,
    // All three are the vendor's own published rejections, not house style.
    maxCuts: 6,
    maxCutChars: 512,
    maxPromptChars: 3072,
    shotFormat: "triple",
    refTokenDialect: "kling-image",
    refTokenBase: 1,
  },
  {
    id: SEEDANCE_MODEL_ID,
    label: "Seedance 2.5",
    // The first capability whose floor is not 3. `checkLadder` already reads
    // `cap.minTotalSeconds`, so nothing needed changing to support it.
    minTotalSeconds: 4,
    maxTotalSeconds: 30,
    minCutSeconds: 1,
    // The vendor states no cut cap and no character ceilings. `null` means exactly that — it is
    // not "unknown, so guess a number".
    maxCuts: null,
    maxCutChars: null,
    maxPromptChars: null,
    shotFormat: "bare-timecode",
    refTokenDialect: "seedance-image",
    refTokenBase: 1,
  },
];

export const DEFAULT_MULTISHOT_MODEL = GEMINI_OMNI_MODEL_ID;

/**
 * The capability for a node's `targetModel`.
 *
 * An absent id is every Multishot node that existed before the field did, so the fallback is not
 * defensive padding — it IS the migration, and it is why no data is backfilled. An UNKNOWN id
 * (a model pruned from the roster) falls back the same way rather than throwing, mirroring
 * `resolveVideoModelId`.
 */
export function multishotCapabilityFor(
  targetModel: string | undefined | null,
): MultishotCapability {
  return (
    MULTISHOT_MODELS.find((m) => m.id === targetModel) ??
    MULTISHOT_MODELS.find((m) => m.id === DEFAULT_MULTISHOT_MODEL)!
  );
}

export type LadderCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether this ladder is legal on this model.
 *
 * The reason is operator-facing and is shown verbatim on the Multishot node, the Multishot focus
 * view and Video Gen's disabled Generate — one sentence, written once, so the three surfaces
 * cannot describe the same violation three different ways.
 *
 * Reports the FIRST violation only. An operator fixes one thing at a time, and a stacked list of
 * everything wrong with a ladder reads as a failure rather than as an instruction.
 *
 * A ladder that is legal on one model and not another is not silently rewritten (D237).
 */
export function checkLadder(
  cuts: { seconds: number }[],
  cap: MultishotCapability,
): LadderCheck {
  if (cuts.length === 0) {
    return { ok: false, reason: "This sequence has no shots." };
  }
  if (cap.maxCuts !== null && cuts.length > cap.maxCuts) {
    return {
      ok: false,
      reason: `${cuts.length} shots · ${cap.label} allows ${cap.maxCuts}. Regroup the shots on the Script.`,
    };
  }
  const short = cuts.find((c) => c.seconds < cap.minCutSeconds);
  if (short) {
    return { ok: false, reason: `Every shot must be at least ${cap.minCutSeconds}s.` };
  }
  const total = cuts.reduce((sum, c) => sum + c.seconds, 0);
  if (total < cap.minTotalSeconds) {
    return { ok: false, reason: `${total}s · ${cap.label} needs at least ${cap.minTotalSeconds}s.` };
  }
  if (total > cap.maxTotalSeconds) {
    return { ok: false, reason: `${total}s · ${cap.label} allows ${cap.maxTotalSeconds}s.` };
  }
  return { ok: true };
}

/**
 * The sentence itself, given a capability and its alternatives.
 *
 * Split out from `multishotRestrictionReason` so the multi-alternative branch below can be
 * exercised before a third model exists — otherwise it is unreachable code that first runs in
 * front of an operator. The public function is the one callers use; this takes its alternatives
 * as an argument so a test can supply a third.
 */
export function restrictionSentenceFor(
  cap: MultishotCapability,
  others: MultishotCapability[],
): string {
  const route =
    others.length === 1
      ? `to generate on ${others[0].label}, switch the Multishot node's model and regenerate the prompt`
      : "to use another model, switch the Multishot node's model and regenerate the prompt";
  return `Connected to a Multishot Prompt written for ${cap.label}. The shot format is model-specific — ${route}.`;
}

/**
 * D239 — the sentence under Video Gen's locked model chip.
 *
 * It states which model THIS PLAN was written for and names the one action that changes it. The
 * old copy explained a capability ("only Omni can generate a multi-shot plan"), which stopped
 * being true the moment there were two multishot models.
 *
 * Built from MULTISHOT_MODELS rather than a hardcoded pair: with exactly one alternative it names
 * it, and with more than one it points at the node instead of listing them. A third model must not
 * silently produce a sentence that names only one way out.
 */
export function multishotRestrictionReason(targetModel: string | undefined | null): string {
  const cap = multishotCapabilityFor(targetModel);
  const others = MULTISHOT_MODELS.filter((m) => m.id !== cap.id);
  return restrictionSentenceFor(cap, others);
}
