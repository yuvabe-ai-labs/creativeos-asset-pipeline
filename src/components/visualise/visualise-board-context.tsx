"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useVisualiseBoard, type BoardData } from "@/hooks/queries/visualise";
import { usePanelDraws } from "@/hooks/use-panel-draws";
import { useVisualiseModel } from "@/hooks/use-visualise-model";
import { PANEL_MODEL_ID } from "@/lib/scripts/visualise/constants";
import { ScriptAssetsProvider } from "@/components/scripts/script-assets-context";

// Piece 5.1 (D524) — one owner for the storyboard on the Visualise screen: the board query, the
// panel model chosen under Advanced, the draw queue and the product and location actions. The board
// and the copilot's panel both read it, so "Draw 6 panels" in the chat is the board's own Generate
// all: the same count, credits, model and queue.

export type VisualiseBoardActions = {
  data: BoardData;
  panelModelId: string;
  setPanelModelId: (id: string) => void;
  draws: ReturnType<typeof usePanelDraws>;
  model: ReturnType<typeof useVisualiseModel>;
};

const BoardContext = createContext<VisualiseBoardActions | null>(null);

export function VisualiseBoardProvider({ clientId, initial, children }: { clientId: string; initial: BoardData; children: ReactNode }) {
  const query = useVisualiseBoard(clientId, initial.script.id, initial);
  const { script, board } = query.data;
  const [panelModelId, setPanelModelId] = useState(PANEL_MODEL_ID);
  const draws = usePanelDraws(clientId, script.id, panelModelId);
  const model = useVisualiseModel(script, board, draws.drawing, query.dataUpdatedAt, panelModelId);
  const value = useMemo(
    () => ({ data: query.data, panelModelId, setPanelModelId, draws, model }),
    [query.data, panelModelId, draws, model],
  );
  return (
    <BoardContext.Provider value={value}>
      {/* D446 — products and locations are edited on the board, and from the copilot's cards. */}
      <ScriptAssetsProvider clientId={clientId} scriptId={script.id}>{children}</ScriptAssetsProvider>
    </BoardContext.Provider>
  );
}

export function useVisualiseBoardActions(): VisualiseBoardActions {
  const value = useContext(BoardContext);
  if (!value) throw new Error("useVisualiseBoardActions needs a VisualiseBoardProvider.");
  return value;
}
