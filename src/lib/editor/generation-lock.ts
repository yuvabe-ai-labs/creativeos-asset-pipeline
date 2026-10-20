// Generation is locked while a clip feeds the Editor (D389): on the connected node, and on the
// Video Gen behind a connected Dubbing node. Nothing further upstream. The canvas keeps this as an
// index updated when edges change, so each node reads its lock in O(1) (performance rule 2); the
// server checks the same rule in editor_generation_lock() (migration 0059).
import type { GenerationLock } from "./types";

export const GENERATION_LOCK_COPY: Record<GenerationLock, { short: string; long: string }> = {
  editor: {
    short: "In use by the Editor · Disconnect to generate",
    long: "This clip is in the Editor's reel. Disconnect it from the Editor to generate.",
  },
  dub: {
    short: "Locked by its dub · feeds the Editor",
    long: "This video's dub is in the Editor's reel. Disconnect the dub from the Editor to generate.",
  },
};

export function computeGenerationLocks(
  nodes: readonly { id: string; type?: string }[],
  edges: readonly { source: string; target: string }[],
): Record<string, GenerationLock> {
  const typeOf = new Map(nodes.map((n) => [n.id, n.type]));
  const locks: Record<string, GenerationLock> = {};
  const dubsInReel = new Set<string>();
  for (const e of edges) {
    if (typeOf.get(e.target) !== "editor") continue;
    locks[e.source] = "editor";
    if (typeOf.get(e.source) === "dubbing") dubsInReel.add(e.source);
  }
  for (const e of edges) {
    if (dubsInReel.has(e.target) && typeOf.get(e.source) === "video-gen" && !locks[e.source]) locks[e.source] = "dub";
  }
  return locks;
}

/** How many nodes feed the Editor directly (one Editor per canvas): its sources. */
export function editorSourceCount(locks: Record<string, GenerationLock>): number {
  let n = 0;
  for (const k in locks) if (locks[k] === "editor") n++;
  return n;
}

/** Same contents, so a recompute that changes nothing keeps the old object (rule 4). */
export function sameLocks(a: Record<string, GenerationLock>, b: Record<string, GenerationLock>): boolean {
  const ak = Object.keys(a);
  return ak.length === Object.keys(b).length && ak.every((k) => a[k] === b[k]);
}
