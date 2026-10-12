"use client";

import { useShallow } from "zustand/react/shallow";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { nodeGenerationStatus, type GenerationJobKind } from "@/lib/generations/node-status";

export type GenerationStatus = {
  isGenerating: boolean;
  /** D284 — true while the running job is a voice change rather than a fresh video. */
  isChangingVoice: boolean;
  lastError: string | null;
  setGenerating: (v: boolean, kind?: GenerationJobKind) => void;
  setLastError: (v: string | null) => void;
};

/** D366 — a node's generation status, read from the canvas's one generations feed. No query and no
 *  channel per node (AGENTS.md performance rules 1–3): the canvas loads and listens once
 *  (use-generation-tray.ts), and this selects its node's part in O(1). */
export function useGenerationStatus(nodeId: string): GenerationStatus {
  const { latest, started, requestError, mark, clear, setRequestError } = useCanvasStore(
    useShallow((s) => ({
      latest: s.latestJobByNode[nodeId],
      started: s.generationStarts[nodeId],
      requestError: s.generationRequestErrors[nodeId] ?? null,
      mark: s.markGenerationStarted,
      clear: s.clearGenerationStarted,
      setRequestError: s.setGenerationRequestError,
    })),
  );
  const status = nodeGenerationStatus(latest, started, requestError);
  return {
    isGenerating: status.isGenerating,
    isChangingVoice: status.isGenerating && status.kind === "voice",
    lastError: status.lastError,
    setGenerating: (v, kind = "video") => (v ? mark(nodeId, kind) : clear(nodeId)),
    setLastError: (v) => setRequestError(nodeId, v),
  };
}
