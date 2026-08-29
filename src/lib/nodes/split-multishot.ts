import type { ShotNodeData } from "@/lib/canvas-nodes";
import { deriveShotType } from "./shot-types";

/**
 * D193 — one grouped Shot's data becomes one single-shot Shot per beat.
 *
 * Each piece keeps the FULL parent script narrowed to its own shot, which is what makes a Shot
 * "a Script node with one shot" (D21): the objective, on-screen text, voiceover and execution
 * notes all travel, so a downstream prompt written against a split piece has the same creative
 * context it had before the split.
 *
 * `shot_type` is re-derived rather than copied, because the group's value was derived from its
 * first shot and is only true of that one.
 */
export function splitMultishotData(data: ShotNodeData): ShotNodeData[] {
  const shots = data.script?.visual_script?.shots ?? [];
  if (shots.length === 0) return [{ ...data, multishot: false }];

  const sourceIndexes = data.seededFrom?.shotIndexes ?? shots.map((_, i) => i);

  return shots.map((shot, i) => ({
    ...data,
    multishot: false,
    shot_type: deriveShotType(shot.description ?? ""),
    script: {
      ...data.script,
      visual_script: { ...data.script?.visual_script, shots: [shot] },
    },
    seededFrom: data.seededFrom
      ? {
          ...data.seededFrom,
          shotIndex: sourceIndexes[i] ?? i,
          shotIndexes: [sourceIndexes[i] ?? i],
        }
      : undefined,
  }));
}
