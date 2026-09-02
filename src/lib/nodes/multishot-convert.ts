// D208 — the lossless pair behind the Script's mode switch.
//
// Specified as one file with both directions in it, rather than left to each call site, because
// what makes the switch a real undo is that a flip and a flip-back cost the operator nothing.
// That property only holds if the two functions are written against each other.
import type { ShotNodeData, MultishotNodeData } from "@/lib/canvas-nodes";
import { cutsFromShots, shotsFromCuts, totalOf } from "./multishot-cuts";
import { OMNI_MIN_SECONDS, OMNI_MAX_SECONDS } from "./group-shots";
import { deriveShotType } from "./shot-types";

const clampBudget = (seconds: number): number =>
  Math.min(OMNI_MAX_SECONDS, Math.max(OMNI_MIN_SECONDS, seconds));

export function shotDataToMultishot(data: ShotNodeData): MultishotNodeData {
  const shots = data.script?.visual_script?.shots ?? [];
  const cuts = cutsFromShots(shots);

  return {
    order: data.order,
    // Passed straight through, not rebuilt field-by-field: `ShotNodeData.seededFrom` carries a
    // legacy `shotIndex` that `MultishotNodeData.seededFrom` never declares, and every multishot
    // node (post-D193) has `shotIndexes` populated, so the shapes agree in practice even though
    // the two types don't align structurally. Cast to say so explicitly, not to paper over a
    // shape the data doesn't actually have.
    seededFrom: data.seededFrom as MultishotNodeData["seededFrom"],
    totalSeconds: clampBudget(totalOf(cuts)),
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
    // Straight passthrough — see the note in shotDataToMultishot. A multishot node's seededFrom
    // never carries `shotIndex`, but a Shot node's type declares it required; the cast says the
    // absence is fine rather than inventing a value the original node never had.
    seededFrom: data.seededFrom as ShotNodeData["seededFrom"],
    // Re-derived, not carried — the stored value described one cut, and after the conversion
    // the node is one take covering all of them.
    shot_type: deriveShotType(cuts[0]?.text ?? ""),
    script: {
      ...data.script,
      visual_script: { ...data.script?.visual_script, shots: shotsFromCuts(cuts) },
    },
  };
}
