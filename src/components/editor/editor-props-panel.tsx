"use client";

import { useState } from "react";
import { EditorCaptionsPanel, type CaptionsTab } from "./editor-captions-panel";
import { useEditorStore } from "./editor-store-provider";
import { EditorPieceProps } from "./editor-piece-props";

/** The properties of the current selection (spec §6): a selected clip's properties, otherwise the
 *  Captions panel. Selecting a caption opens its Text tab (spec §9). */
export function EditorPropsPanel() {
  const selection = useEditorStore((s) => s.selection);
  const piece = useEditorStore((s) => (s.selection?.kind === "piece" ? s.doc.pieces.find((p) => p.id === s.selection!.id) : undefined));
  const source = useEditorStore((s) => (piece ? s.sources.find((x) => x.nodeId === piece.sourceNodeId) : undefined));
  const [tab, setTab] = useState<CaptionsTab>("text");
  // A caption just selected shows its line: adjust the tab while rendering, not in an effect.
  const captionId = selection?.kind === "caption" ? selection.id : null;
  const [seen, setSeen] = useState<string | null>(null);
  if (captionId !== seen) {
    setSeen(captionId);
    if (captionId) setTab("text");
  }

  return (
    <aside aria-label="Properties" className="flex min-h-0 flex-col gap-[18px] overflow-y-auto rounded-[14px] border border-border bg-card p-[18px]">
      {piece && source ? <EditorPieceProps piece={piece} source={source} /> : <EditorCaptionsPanel tab={tab} onTab={setTab} />}
    </aside>
  );
}
