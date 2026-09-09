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
   * How `renderPlan` lays the beats out (D238).
   *   timecode — `[0-2s] …` cumulative ladder, one line per beat (Omni)
   *   triple   — `shot n, m, words;` (Kling's API format — NOT its console syntax)
   */
  shotFormat: "timecode" | "triple";
  /** First index a reference token carries: `<IMAGE_REF_0>` vs `@image_1`. */
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
  const route =
    others.length === 1
      ? `to generate on ${others[0].label}, switch the Multishot node's model and regenerate the prompt`
      : "to use another model, switch the Multishot node's model and regenerate the prompt";
  return `Connected to a Multishot Prompt written for ${cap.label}. The shot format is model-specific — ${route}.`;
}
