// D208 — the lossless pair behind the Script's mode switch.
//
// Specified as one file with both directions in it, rather than left to each call site, because
// what makes the switch a real undo is that a flip and a flip-back cost the operator nothing.
// That property only holds if the two functions are written against each other.
import type { ShotNodeData, MultishotNodeData } from "@/lib/canvas-nodes";
import { clampTotal, cutsFromShots, fitToTotal, shotsFromCuts, totalOf } from "./multishot-cuts";
import { deriveShotType } from "./shot-types";

export function shotDataToMultishot(data: ShotNodeData): MultishotNodeData {
  const shots = data.script?.visual_script?.shots ?? [];
  const rawCuts = cutsFromShots(shots);

  // Kling-allocation rework (operator request 2026-09-03): totalSeconds is now the operator's
  // INDEPENDENT target, not a mirror of totalOf(cuts) (see multishot-cuts.ts's header) — but a
  // freshly-converted node must never open already unbalanced. Seed the Total from the Shot's
  // packed seconds, clamped into Omni's window (a Shot's parsed duration can land outside it —
  // see group-shots.ts's lone over-cap shot), then fit the cuts to land exactly on it, so
  // allocated === total on creation.
  const totalSeconds = clampTotal(totalOf(rawCuts));
  const cuts = fitToTotal(rawCuts, totalSeconds);

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
