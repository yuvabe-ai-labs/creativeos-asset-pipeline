// Pure search + sort for list/table screens. Generic over the row type via accessors.

export type SortKey = "recent" | "name";

export interface ListAccessors<T> {
  name: (row: T) => string;
  timestamp: (row: T) => string | null;
}

export function filterAndSort<T>(
  rows: T[],
  query: string,
  sort: SortKey,
  accessors: ListAccessors<T>,
): T[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => accessors.name(r).toLowerCase().includes(q))
    : [...rows];

  return filtered.sort((a, b) => {
    if (sort === "name") {
      return accessors.name(a).localeCompare(accessors.name(b), undefined, {
        sensitivity: "base",
      });
    }
    // recent: newest first, missing timestamps last
    const ta = accessors.timestamp(a);
    const tb = accessors.timestamp(b);
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });
}
