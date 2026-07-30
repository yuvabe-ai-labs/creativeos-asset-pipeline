// Pure reconcile planner. Given the ids currently on the canvas and the ids the
// client explicitly removed since load, decide which ids to delete. We delete ONLY
// ids the client removed AND that are not back on the canvas (a remove-then-readd
// keeps the row). Crucially we never delete by "absence from the snapshot", so a
// node another session added — which this client never saw — is never touched.
export function planReconcile(
  snapshotIds: string[],
  removedIds: string[],
): { deleteIds: string[] } {
  const present = new Set(snapshotIds);
  const deleteIds = [...new Set(removedIds)].filter((id) => !present.has(id));
  return { deleteIds };
}

// PostgREST encodes `.in("id", …)` in the URL query string, so a mass delete
// (hundreds of ids) blows the gateway's URL length limit and the WHOLE save
// throws — the deletion silently never lands. Batch ids so each request stays
// well under the limit. 100 uuids ≈ 4KB of URL.
export function chunkIds(ids: string[], size = 100): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}
