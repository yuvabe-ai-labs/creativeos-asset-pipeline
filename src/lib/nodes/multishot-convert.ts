// D208 — the lossless pair behind the Script's mode switch.
//
// Specified as one file with both directions in it, rather than left to each call site, because
// what makes the switch a real undo is that a flip and a flip-back cost the operator nothing.
// That property only holds if the two functions are written against each other.
import type { ShotNodeData, MultishotNodeData } from "@/lib/canvas-nodes";
import { clampTotal, cutsFromShots, shotsFromCuts, totalOf } from "./multishot-cuts";
import { deriveShotType } from "./shot-types";

export function shotDataToMultishot(data: ShotNodeData): MultishotNodeData {
  const shots = data.script?.visual_script?.shots ?? [];
  const cuts = cutsFromShots(shots);

  // No Total control any more (multishot-cuts.ts's header) — `totalSeconds` is just the stored
  // mirror of the ladder's own length, clamped into Omni's window for the field that seeds a
  // request's duration. `clampTotal` only clamps the NUMBER; it never reshapes `cuts` to match,
  // so the two can disagree here only in the pre-existing edge case group-shots.ts documents (a
  // single shot longer than OMNI_MAX_SECONDS forced into its own over-cap group).
  const totalSeconds = clampTotal(totalOf(cuts));

  return {
    order: data.order,
    seededFrom: data.seededFrom,
    totalSeconds,
    cuts,
    script: {
      ...data.script,
      // The envelope keeps execution notes and everything else; only the shot list goes,
      // because `cuts` is now the sole copy of it.
      visual_script: { ...data.script?.visual_script, shots: undefined },
    },
    // No shot_type: framing is per cut on a multishot node.
  };
}

export function multishotDataToShot(data: MultishotNodeData): ShotNodeData {
  const cuts = data.cuts ?? [];

  return {
    order: data.order,
    seededFrom: data.seededFrom,
    // Re-derived, not carried — the stored value described one cut, and after the conversion
    // the node is one take covering all of them.
    shot_type: deriveShotType(cuts[0]?.text ?? ""),
    script: {
      ...data.script,
      visual_script: { ...data.script?.visual_script, shots: shotsFromCuts(cuts) },
    },
  };
}
