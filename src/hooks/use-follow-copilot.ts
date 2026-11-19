"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAskingTarget, useCopilotActivity } from "@/hooks/queries/copilot-thread";
import type { TargetActivity } from "@/lib/journey/thread/target-activity";

// The page shows the copilot's work (D508): one shared way for any page to follow the copilot. The
// page names its targets (CopilotTarget) and says how to reveal one (switch tab); this hook moves
// there, and tells each target whether it is asked about, being written, or has just landed.

export type TargetState = {
  /** The question waiting is about this target ("Copilot is asking"). Everyone sees it. */
  asking: boolean;
  /** The copilot is changing it now (the sweep). */
  writing: boolean;
  /** The count of a change that just landed, for the highlight; null once it has faded. */
  landed: number | null;
  /** The count of the latest change to it (0 if none): a stable key, so the target's content is
   *  re-mounted once per change and an unsaved edit of it gives way (spec §3.2). */
  version: number;
};

/** How long a landed change stays highlighted (hold, then a 500 ms fade). */
export const LANDED_MS = 1500;

/** Pure: the target to move to now, or null. `seen` is the last move count handled. On first sight
 *  of an asked target after the page opened (`opened` false), the asked target is returned. A target
 *  `canShow` rejects is skipped (spec §3.3). */
export function nextMove(input: {
  activity: TargetActivity; asking: string | null; seen: number; opened: boolean; canShow: (t: string) => boolean;
}): { target: string; n: number } | null {
  const { activity, asking, seen, opened, canShow } = input;
  if (activity.move && activity.move.n > seen && canShow(activity.move.target)) return activity.move;
  if (!opened && asking && canShow(asking)) return { target: asking, n: seen };
  return null;
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Brings a tagged target into view once it is on screen: a tab switch may take a few frames. */
function scrollToTarget(target: string, tries = 10): void {
  const el = document.querySelector(`[data-copilot-target="${CSS.escape(target)}"]`);
  if (el) {
    el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    return;
  }
  if (tries > 0) requestAnimationFrame(() => scrollToTarget(target, tries - 1));
}

/** Follows the copilot on this page. `reveal` makes a target reachable (switch tab) and returns false
 *  when this page cannot show it. Only this browser's own turns move the page (the activity is fed by
 *  this browser's turns); the asked mark comes from the shared thread, so everyone sees it. */
export function useFollowCopilot(clientId: string, reveal: (target: string) => boolean) {
  const activity = useCopilotActivity(clientId);
  const asking = useAskingTarget(clientId);

  // A page that opens after a move (or a change) was made does not replay it.
  const seen = useRef(activity.move?.n ?? 0);
  const opened = useRef(false);
  const lastWritten = useRef(activity.written.at(-1)?.n ?? 0);
  const [landed, setLanded] = useState<Map<string, number>>(() => new Map());

  useEffect(() => {
    const move = nextMove({ activity, asking, seen: seen.current, opened: opened.current, canShow: reveal });
    if (asking) opened.current = true;
    if (!move) return;
    seen.current = Math.max(seen.current, move.n);
    opened.current = true;
    scrollToTarget(move.target);
  }, [activity, asking, reveal]);

  // Each new change lands: highlighted for LANDED_MS, then it fades.
  useEffect(() => {
    const fresh = activity.written.filter((w) => w.n > lastWritten.current);
    if (fresh.length === 0) return;
    lastWritten.current = fresh[fresh.length - 1].n;
    setLanded((m) => new Map([...m, ...fresh.map((w) => [w.target, w.n] as const)]));
    const timer = setTimeout(() => {
      setLanded((m) => new Map([...m].filter(([t, n]) => !fresh.some((w) => w.target === t && w.n === n))));
    }, LANDED_MS);
    return () => clearTimeout(timer);
  }, [activity.written]);

  // Built once per change, so each target's state is a lookup, never a scan (performance rule 2).
  const writing = useMemo(() => new Set(activity.writing), [activity.writing]);
  const versions = useMemo(() => new Map(activity.written.map((w) => [w.target, w.n] as const)), [activity.written]);
  const stateOf = useCallback((target: string): TargetState => ({
    asking: target === asking,
    writing: writing.has(target),
    landed: landed.get(target) ?? null,
    version: versions.get(target) ?? 0,
  }), [asking, writing, landed, versions]);

  return { stateOf, written: activity.written };
}
