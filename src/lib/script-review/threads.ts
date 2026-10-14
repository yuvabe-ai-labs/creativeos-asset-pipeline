// src/lib/script-review/threads.ts
import type { ScriptDoc } from "@/lib/scripts/schema";
import { partKey, partShotId } from "./parts";
import type { RemovedShot, ScriptComment, Thread } from "./types";

export function buildThreads(comments: ScriptComment[]): Thread[] {
  const byTime = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return byTime
    .filter((c) => c.parentId === null)
    .map((root) => ({
      root,
      replies: byTime.filter((c) => c.parentId === root.id),
      resolved: root.resolvedAt !== null,
    }));
}

export type PlacedThreads = {
  byPart: Map<string, Thread[]>;
  removed: { shotId: string; label: string; text: string; threads: Thread[] }[];
};

/** Spec 4 §5–§6: threads beside the part they are about, in the script on screen. A thread whose
 *  shot (or that shot's panel) is not in that script any more sits under "On a removed shot" with
 *  the shot's last text. A split's first half keeps the id, so its threads stay where they were. */
export function placeThreads(threads: Thread[], doc: ScriptDoc, removed: Record<string, RemovedShot>): PlacedThreads {
  const shotIds = new Set(doc.shots.map((s) => s.id));
  const byPart = new Map<string, Thread[]>();
  const gone = new Map<string, Thread[]>();
  for (const thread of threads) {
    const shotId = partShotId(thread.root.part);
    if (shotId && !shotIds.has(shotId)) {
      gone.set(shotId, [...(gone.get(shotId) ?? []), thread]);
      continue;
    }
    const key = partKey(thread.root.part);
    byPart.set(key, [...(byPart.get(key) ?? []), thread]);
  }
  return {
    byPart,
    removed: [...gone].map(([shotId, ts]) => ({
      shotId,
      label: removed[shotId]?.label ?? "A removed shot",
      text: removed[shotId]?.text ?? "",
      threads: ts,
    })),
  };
}

/** Every shot the given script lacks, with its number and visual in the last shared version that had
 *  it. `versions` are oldest first. */
export function removedShots(versions: { doc: ScriptDoc }[], doc: ScriptDoc): Record<string, RemovedShot> {
  const last: Record<string, RemovedShot> = {};
  for (const v of versions) {
    v.doc.shots.forEach((s, i) => {
      last[s.id] = { label: `S${i + 1}`, text: s.visual };
    });
  }
  const present = new Set(doc.shots.map((s) => s.id));
  return Object.fromEntries(Object.entries(last).filter(([id]) => !present.has(id)));
}

export function openThreads(threads: Thread[]): Thread[] {
  return threads.filter((t) => !t.resolved);
}

const QUOTE_MAX = 80;
const shorten = (s: string) => (s.length <= QUOTE_MAX ? s : `${s.slice(0, QUOTE_MAX - 1).trimEnd()}…`);
const quote = (t: Thread) => `“${shorten(t.root.body)}”`;

/** Spec 4 §8: "You have 1 open comment: 'Can she wear blue?' Approve anyway?" Null when none are open. */
export function approveConfirmText(open: Thread[]): string | null {
  if (open.length === 0) return null;
  if (open.length === 1) return `You have 1 open comment: ${quote(open[0])}. Approve anyway?`;
  const shown = open.slice(0, 3).map(quote).join(", ");
  const more = open.length > 3 ? ` and ${open.length - 3} more` : "";
  return `You have ${open.length} open comments: ${shown}${more}. Approve anyway?`;
}
