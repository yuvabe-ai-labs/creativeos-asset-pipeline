// src/lib/script-review/column.ts
import type { ScriptDoc } from "@/lib/scripts/schema";
import { partKey, partLabel, partOrder } from "./parts";
import type { PlacedThreads } from "./threads";
import type { Part, Thread } from "./types";

/** One part's place in the Comments column. */
export type ColumnGroup = { key: string; part: Part; label: string | null; threads: Thread[] };

/** Where the column is focused: the part a marker opened, whether its composer is open, and a
 *  counter so pressing the same marker again scrolls to it again. */
export type ColumnFocus = { part: Part; compose: boolean; nonce: number };

/** Spec 4 §4 (review board): the column lists threads by part, in page order. The part a marker just
 *  opened is listed even with no thread yet, so its first comment is written in its place. */
export function columnGroups(placed: PlacedThreads, doc: ScriptDoc, focus: Part | null): ColumnGroup[] {
  const groups = new Map<string, ColumnGroup>();
  for (const [key, threads] of placed.byPart) {
    const part = threads[0].root.part;
    groups.set(key, { key, part, label: partLabel(part, doc), threads });
  }
  if (focus) {
    const key = partKey(focus);
    if (!groups.has(key)) groups.set(key, { key, part: focus, label: partLabel(focus, doc), threads: [] });
  }
  return [...groups.values()].sort((a, b) => partOrder(a.part, doc) - partOrder(b.part, doc));
}

/** Every thread on the page, those "On a removed shot" included: the Comments button's count. */
export function threadCount(placed: PlacedThreads): number {
  let count = placed.removed.reduce((n, r) => n + r.threads.length, 0);
  for (const threads of placed.byPart.values()) count += threads.length;
  return count;
}
