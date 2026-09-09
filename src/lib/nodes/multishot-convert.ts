// D229 — the lossless pair behind the Script's mode switch.
//
// Specified as one file with both directions in it, rather than left to each call site, because
// what makes the switch a real undo is that a flip and a flip-back cost the operator nothing.
// That property only holds if the two functions are written against each other.
import type { ShotNodeData, MultishotNodeData } from "@/lib/canvas-nodes";
import { cutsFromShots, shotsFromCuts, totalOf } from "./multishot-cuts";
import { deriveShotType } from "./shot-types";

export function shotDataToMultishot(data: ShotNodeData): MultishotNodeData {
  const shots = data.script?.visual_script?.shots ?? [];
  const cuts = cutsFromShots(shots);

  // No Total control any more (multishot-cuts.ts's header) — `totalSeconds` is just the stored
  // mirror of the ladder's own length.
  //
  // A MIRROR, NOT A CORRECTION (D237, canvas-nodes.ts): deliberately NOT clamped into any model's
  // window. It was `clampTotal(totalOf(cuts), …)` here and at canvas-store.ts's seed site after the
  // clamp had already been dropped from the EDIT site (multishot-node.tsx), which is how a
  // script-seeded single 2s shot stored `totalSeconds: 3` while `totalOf(cuts)` was 2 — the card
  // showed "3s · 1 cuts" in large type with `checkLadder`'s red "2s · Gemini Omni 1.1 needs at
  // least 3s." underneath it. Two numbers for one ladder, and the wrong one in the larger type.
  // The ladder keeps its real length; the violation is STATED by `checkLadder`.
  const totalSeconds = totalOf(cuts);

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
