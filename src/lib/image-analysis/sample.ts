// Which cards the summary call reads (D316). Pure. The counts in the tab always cover every card;
// only the card lines handed to the model are capped, so the call stays the size it was tested at.
import type { CardEntry } from "./aggregate";
import { SUMMARY_MIN_PER_GROUP, SUMMARY_UPLOAD_SHARE } from "./constants";

/**
 * Every card when they fit in `cap`, uploads first. Above it, a sample that keeps the brand's mix:
 * - uploads take up to a third of the places (the team chose them; more if little else exists);
 * - the rest are shared among format-and-source groups in proportion to their size, with every
 *   group getting at least a few, so a rare format is still seen;
 * - within a group, picks are spread evenly, not taken from the front.
 */
export function selectCardsForSummary(entries: CardEntry[], cap: number): CardEntry[] {
  const uploads = entries.filter((e) => e.source === "upload");
  const rest = entries.filter((e) => e.source !== "upload");
  if (entries.length <= cap) return [...uploads, ...rest];

  const uploadPlaces = Math.min(uploads.length, Math.max(Math.floor(cap * SUMMARY_UPLOAD_SHARE), cap - rest.length));
  const groups = new Map<string, CardEntry[]>();
  for (const e of rest) {
    const key = `${e.card.format}|${e.source}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const lists = [...groups.values()];
  const quotas = shareOut(
    lists.map((l) => l.length),
    cap - uploadPlaces,
    SUMMARY_MIN_PER_GROUP,
  );
  return [...spread(uploads, uploadPlaces), ...lists.flatMap((l, i) => spread(l, quotas[i]))];
}

/** `n` items spread evenly across the list, first and last region included. */
export function spread<T>(list: T[], n: number): T[] {
  if (n >= list.length) return list;
  return Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]);
}

/**
 * Splits `budget` places among groups of the given sizes: each first gets up to `floor`, then the
 * rest goes in proportion to what each group has left (largest remainder), never above its size.
 */
export function shareOut(sizes: number[], budget: number, floor: number): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (budget >= total) return sizes;
  const base = sizes.map((s) => Math.min(s, floor));
  const baseSum = base.reduce((a, b) => a + b, 0);
  // Too many groups for the floor: share the whole budget by size instead.
  const start = baseSum > budget ? sizes.map(() => 0) : base;
  const left = sizes.map((s, i) => s - start[i]);
  const extra = budget - start.reduce((a, b) => a + b, 0);
  const leftSum = left.reduce((a, b) => a + b, 0);
  const exact = left.map((l) => (extra * l) / leftSum);
  const quotas = start.map((s, i) => s + Math.floor(exact[i]));
  let spare = budget - quotas.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of byRemainder) {
    if (spare === 0) break;
    if (quotas[i] < sizes[i]) {
      quotas[i]++;
      spare--;
    }
  }
  return quotas;
}
