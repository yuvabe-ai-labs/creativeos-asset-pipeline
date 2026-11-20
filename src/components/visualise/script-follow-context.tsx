"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CopilotTarget } from "@/components/journey/copilot-target";
import { addLanded, pruneLanded, type Landed, type TargetState } from "@/hooks/use-follow-copilot";
import { visualiseStep } from "@/lib/scripts/copilot/visualise-walk";
import { showOnBoard } from "./show-on-board";
import { useVisualiseBoardActions } from "./visualise-board-context";

// Piece 5.1 §3.8 (D508) — the Visualise board follows the script's copilot: the part the walk asks
// about is marked "Copilot is asking", and what the copilot just changed lands with a highlight. One
// provider for the screen; each target's state is a lookup (performance rule 2). There is no sweep
// while the copilot works: the script copilot does not say what it is changing until it has.

type Follow = { stateOf: (target: string) => TargetState; land: (targets: string[]) => void };
const FollowContext = createContext<Follow | null>(null);

/** Pure: one target's marks. */
export function targetState(target: string, asking: string | null, landed: Landed): TargetState {
  const l = landed.get(target);
  return { asking: target === asking, writing: false, landed: l?.n ?? null, version: l?.n ?? 0 };
}

/** Inside VisualiseBoardProvider: the walk's step names what is being asked about. */
export function ScriptFollowProvider({ children }: { children: ReactNode }) {
  const { data, model } = useVisualiseBoardActions();
  const step = visualiseStep({ doc: data.script.doc, avatars: model.avatars, views: model.views, plan: model.plan });
  const asking = step.kind === "cast" || step.kind === "finish_avatar" ? `cast:${step.castId}` : null;
  const [landed, setLanded] = useState<Landed>(() => new Map());
  const count = useRef(0);

  const land = useCallback((targets: string[]) => {
    if (targets.length === 0) return;
    const n = ++count.current;
    setLanded((m) => addLanded(m, targets.map((target) => ({ target, n })), Date.now()));
    showOnBoard(targets[0]);
  }, []);
  // One timer, for whichever landing fades next.
  useEffect(() => {
    if (landed.size === 0) return;
    const next = Math.min(...[...landed.values()].map((l) => l.until));
    const timer = setTimeout(() => setLanded((m) => pruneLanded(m, Date.now())), Math.max(0, next - Date.now()));
    return () => clearTimeout(timer);
  }, [landed]);

  const value = useMemo<Follow>(() => ({ stateOf: (t) => targetState(t, asking, landed), land }), [asking, landed, land]);
  return <FollowContext.Provider value={value}>{children}</FollowContext.Provider>;
}

/** Null outside the Visualise screen (the Generate page, the review page). */
export function useScriptFollow(): Follow | null {
  return useContext(FollowContext);
}

/** A part of the board the copilot can work on; plain content where nothing follows the copilot. */
export function FollowTarget({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const follow = useScriptFollow();
  if (!follow) return <>{children}</>;
  return <CopilotTarget id={id} state={follow.stateOf(id)} className={className}>{children}</CopilotTarget>;
}
