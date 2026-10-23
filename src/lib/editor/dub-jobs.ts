// Dubs and lip syncs as the editor sees them (D406): the latest one per Dubbing node, which are
// running, and which just finished. Pure.
export type EditorDubJob = { nodeId: string; kind: "dub" | "lipsync"; status: "running" | "succeeded" | "failed"; error: string | null };

/** Nodes with a dub or lip sync running, including starts the server hasn't reported yet. */
export function busyNodes(jobs: EditorDubJob[] | undefined, pending: ReadonlyMap<string, "dub" | "lipsync">): Map<string, "dub" | "lipsync"> {
  const out = new Map(pending);
  for (const j of jobs ?? []) if (j.status === "running") out.set(j.nodeId, j.kind);
  return out;
}

/** Jobs that were running (or just started) before and have now finished. */
export function finishedJobs(before: ReadonlyMap<string, "dub" | "lipsync">, jobs: EditorDubJob[] | undefined): EditorDubJob[] {
  return (jobs ?? []).filter((j) => j.status !== "running" && before.get(j.nodeId) === j.kind);
}
