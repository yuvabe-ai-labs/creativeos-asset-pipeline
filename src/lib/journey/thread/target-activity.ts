import { walkOf } from "@/lib/journey/kb-copilot/walk";
import type { ThreadState } from "./schema";

// What the copilot is doing to the page right now, by target (the page shows the copilot's work,
// D520). Kept by the panel in the query cache and read by the page beside it. Stage-neutral and pure:
// a target is an opaque id the page tagged.

export type TargetActivity = {
  /** Targets being changed now (they shimmer). */
  writing: string[];
  /** The last changes, newest last, each with the count it was made at (they land). */
  written: { target: string; n: number }[];
  /** Where the page should go, and the count of that request, so a page moves once per request. */
  move: { target: string; n: number } | null;
  /** Counts every change, so a new event is never mistaken for one already seen. */
  n: number;
};

export const NO_TARGET_ACTIVITY: TargetActivity = { writing: [], written: [], move: null, n: 0 };

export type TargetEvent =
  | { type: "writing" | "written" | "unwritten"; target: string; move: boolean }
  /** The copilot is now asking about this target. */
  | { type: "asked"; target: string }
  /** The turn is over, however it ended: nothing is being written any more. */
  | { type: "endTurn" };

const WRITTEN_KEPT = 20;

export function applyTargetEvent(a: TargetActivity, e: TargetEvent): TargetActivity {
  const n = a.n + 1;
  switch (e.type) {
    case "writing":
      return {
        ...a, n,
        writing: a.writing.includes(e.target) ? a.writing : [...a.writing, e.target],
        move: e.move ? { target: e.target, n } : a.move,
      };
    case "written":
      return {
        ...a, n,
        writing: a.writing.filter((t) => t !== e.target),
        written: [...a.written, { target: e.target, n }].slice(-WRITTEN_KEPT),
        move: e.move ? { target: e.target, n } : a.move,
      };
    case "unwritten":
      if (!a.writing.includes(e.target)) return a;
      return { ...a, n, writing: a.writing.filter((t) => t !== e.target) };
    case "asked":
      return { ...a, n, move: { target: e.target, n } };
    case "endTurn":
      return a.writing.length === 0 ? a : { ...a, n, writing: [] };
  }
}

/** The target of the question the thread waits on, mapped by the stage (the review walk's own rule:
 *  the last thing said is a question, looking past a note of a save on the page); else null. */
export function askingTargetOf(state: ThreadState | undefined, toTarget: (field: string) => string): string | null {
  if (!state) return null;
  const pending = walkOf(state.messages).pending;
  return pending ? toTarget(pending) : null;
}
