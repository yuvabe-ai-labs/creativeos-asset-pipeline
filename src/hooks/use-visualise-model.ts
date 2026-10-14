"use client";

import { useMemo } from "react";
import type { Script } from "@/lib/scripts/schema";
import { estimatePanelCredits, panelInputs, panelReferenceCap, type PanelInputs } from "@/lib/scripts/visualise/panel-inputs";
import { panelAspect } from "@/lib/scripts/visualise/panel-prompt";
import { generateAllPlan, panelView, visualiseReadiness, type PanelView } from "@/lib/scripts/visualise/state";
import type { VisualiseBoard } from "@/lib/scripts/visualise/schema";

/** Everything the Visualise view shows, derived from the script and its board with the same
 *  pure functions the draw route uses. `now` is when the board was read, for the take timeout. */
export function useVisualiseModel(script: Script, board: VisualiseBoard, drawing: ReadonlySet<string>, now: number, modelId: string) {
  return useMemo(() => {
    const avatars = new Map(board.avatars.map((a) => [a.id, a]));
    const cap = panelReferenceCap(modelId);
    const aspect = panelAspect(script.doc);
    const inputs = new Map<string, PanelInputs>();
    const views = new Map<string, PanelView>();
    const credits = new Map<string, number | null>();
    for (const shot of script.doc.shots) {
      const i = panelInputs({ doc: script.doc, shot, avatars, kits: board.kits, cap });
      inputs.set(shot.id, i);
      views.set(shot.id, panelView({
        inputs: i, takes: board.takes.filter((t) => t.shotId === shot.id),
        pickId: board.picks[shot.id], drawing: drawing.has(shot.id), now,
      }));
      credits.set(shot.id, estimatePanelCredits(i.references.length, aspect, modelId));
    }
    return {
      avatars, aspect, inputs, views, credits,
      readiness: visualiseReadiness(script.doc, avatars, views),
      plan: generateAllPlan(script.doc, views, (id) => credits.get(id) ?? null),
      avatarFaces: Object.fromEntries(board.avatars.map((a) => [a.id, a.front?.url ?? null])),
    };
  }, [script, board, drawing, now, modelId]);
}
