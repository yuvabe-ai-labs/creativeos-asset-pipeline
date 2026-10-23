"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useReelPlayback, type ReelPlayback } from "@/hooks/use-reel-playback";
import { resolvePieceMedia } from "@/lib/editor/playback";
import type { Piece } from "@/lib/editor/types";
import { useEditorStore } from "./editor-store-provider";

// One player for the page: the stage, the transport, the timeline and the props panel all read
// and move the same playhead.
const PlaybackContext = createContext<ReelPlayback | null>(null);

export function EditorPlaybackProvider({ children }: { children: ReactNode }) {
  const pieces = useEditorStore((s) => s.doc.pieces);
  const sources = useEditorStore((s) => s.sources);
  const media = useCallback(
    (p: Piece) => {
      const source = sources.find((s) => s.nodeId === p.sourceNodeId);
      return source ? resolvePieceMedia(p, source) : null;
    },
    [sources],
  );
  const playback = useReelPlayback(pieces, media);
  return <PlaybackContext.Provider value={playback}>{children}</PlaybackContext.Provider>;
}

export function usePlayback(): ReelPlayback {
  const playback = useContext(PlaybackContext);
  if (!playback) throw new Error("usePlayback must be used inside EditorPlaybackProvider");
  return playback;
}
