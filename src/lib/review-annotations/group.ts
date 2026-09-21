// Group any timecoded items (drafts while composing, rows while reading) for the
// Review-column list: null (image) first, then ascending timecodes; item order
// within a group is preserved (pin order).
export function groupByTimecode<T extends { timecodeMs: number | null }>(
  items: T[],
): { timecodeMs: number | null; items: T[] }[] {
  const groups = new Map<number | null, T[]>();
  for (const item of items) {
    const key = item.timecodeMs;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : a - b))
    .map(([timecodeMs, grouped]) => ({ timecodeMs, items: grouped }));
}
