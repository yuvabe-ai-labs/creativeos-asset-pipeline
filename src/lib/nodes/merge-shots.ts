import type { ShotNodeData } from "@/lib/canvas-nodes";
import type { ReelShot } from "@/lib/nodes/reel-script";
import { deriveShotType } from "./shot-types";
import { shotSeconds, OMNI_MAX_SECONDS } from "./group-shots";

/**
 * D202 — merge several Shot nodes into ONE multishot node. The inverse of `splitMultishotData`.
 *
 * Fan-out already groups shots automatically and the multishot toggle already splits a group back
 * apart; merging is the move that was missing — recombining pieces the operator split, or grouping
 * shots the automatic packing left separate.
 *
 * Deliberately NOT drag-and-drop. The canvas already has drag-select with batched duplicate and
 * delete, so merge is a third action on that same selection: one interaction model, not two.
 */

export type MergeBlock =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Whether a selection can become one multishot node.
 *
 * Three refusals, each a real incoherence rather than a style preference:
 *
 *  - Shots from DIFFERENT scripts share no objective, no on-screen text and no voiceover, and the
 *    merged node can only keep one script's worth of that metadata. The other's would be silently
 *    dropped, so the merge is refused instead.
 *  - Over the Omni cap the request's duration would be shorter than the ladder, and the clip comes
 *    back truncated at full price — the same cap `groupShotsForFanOut` packs to.
 *  - Fewer than two nodes is not a merge.
 */
export function canMergeShots(
  nodes: Array<{ type?: string; data: ShotNodeData }>,
): MergeBlock {
  if (nodes.length < 2) return { ok: false, reason: "Select at least two shots to merge." };
  if (nodes.some((n) => n.type !== "shot")) {
    return { ok: false, reason: "Only Shot nodes can be merged." };
  }

  const scriptIds = new Set(nodes.map((n) => n.data.seededFrom?.scriptNodeId ?? ""));
  if (scriptIds.size > 1) {
    return { ok: false, reason: "These shots come from different scripts." };
  }

  const seconds = totalSeconds(nodes.map((n) => n.data));
  if (seconds > OMNI_MAX_SECONDS) {
    return {
      ok: false,
      reason: `That would run ${seconds}s — over the ${OMNI_MAX_SECONDS}s multishot cap.`,
    };
  }

  return { ok: true };
}

/** Every beat across the given nodes, in the order those nodes carry them. */
export function collectShots(datas: ShotNodeData[]): ReelShot[] {
  return datas.flatMap((d) => d.script?.visual_script?.shots ?? []);
}

export function totalSeconds(datas: ShotNodeData[]): number {
  return collectShots(datas).reduce((sum, shot) => sum + shotSeconds(shot), 0);
}

/**
 * Order the selection the way the SCRIPT does, not the way it was clicked.
 *
 * The ladder's timings are cumulative, so beat order is the edit. Selection order is an artifact
 * of how the operator happened to drag the box, and using it would silently reorder the film.
 *
 * `shotIndexes[0]` is the node's first beat in the parent script; `order` is the fallback for a
 * pre-D193 node that never recorded indexes.
 */
export function sortForMerge<T extends { data: ShotNodeData }>(nodes: T[]): T[] {
  const key = (d: ShotNodeData) =>
    d.seededFrom?.shotIndexes?.[0] ?? d.seededFrom?.shotIndex ?? d.order ?? Number.MAX_SAFE_INTEGER;
  return [...nodes].sort((a, b) => key(a.data) - key(b.data));
}

/**
 * The merged node's data.
 *
 * The FIRST node in script order supplies the script envelope — objective, on-screen text,
 * voiceover, caption — because `canMergeShots` has already established every node came from the
 * same script, so they all carry the same envelope anyway.
 *
 * `shot_type` is re-derived from the merged first beat for the same reason the split re-derives
 * it: the stored value describes one beat, and after a merge that beat may no longer be first.
 */
export function mergeShotData(datas: ShotNodeData[]): ShotNodeData {
  const [first] = datas;
  const shots = collectShots(datas);
  const indexes = datas.flatMap(
    (d) => d.seededFrom?.shotIndexes ?? (d.seededFrom ? [d.seededFrom.shotIndex] : []),
  );
  // The earliest position in the script, or absent when no node ever had one — never a sentinel,
  // which would sort the merged node to the very end of the reel.
  const orders = datas.map((d) => d.order).filter((o): o is number => typeof o === "number");

  return {
    ...first,
    // Two beats or more genuinely IS a cut sequence. A merge of one is not reachable through
    // canMergeShots, but the flag should still describe the data if it ever is.
    multishot: shots.length > 1,
    shot_type: deriveShotType(shots[0]?.description ?? ""),
    order: orders.length > 0 ? Math.min(...orders) : undefined,
    script: {
      ...first.script,
      visual_script: { ...first.script?.visual_script, shots },
    },
    seededFrom: first.seededFrom
      ? {
          ...first.seededFrom,
          shotIndex: indexes[0] ?? first.seededFrom.shotIndex,
          shotIndexes: indexes,
        }
      : undefined,
  };
}
