/**
 * The `vN` label of every version, exactly as History numbers its rows
 * (version-history-list.tsx: `v${total - i}` over the newest-first list, so v1 is the oldest and
 * failed attempts count too). One source of truth for every surface that names a version —
 * History, "Sent to model" and the Edit voice source picker — so "changed from v3" always points
 * at the row the operator sees as v3.
 */
export function versionLabelsById(versions: Array<{ id: string; createdAt: string }>): Map<string, string> {
  const newestFirst = [...versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const total = newestFirst.length;
  return new Map(newestFirst.map((v, i) => [v.id, `v${total - i}`]));
}
