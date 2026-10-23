"use client";

import { useState } from "react";
import { EditorCaptionsPanel, type CaptionsTab } from "./editor-captions-panel";
import { EditorClipInspector } from "./editor-clip-inspector";
import { EditorPanelHeader } from "./editor-panel-rail";
import { useEditorStore } from "./editor-store-provider";

/** The Inspector (D405): a selected clip's tabs, otherwise the Captions panel, on Style. */
export function EditorPropsPanel({ onCollapse }: { onCollapse(): void }) {
  const piece = useEditorStore((s) => (s.selection?.kind === "piece" ? s.doc.pieces.find((p) => p.id === s.selection!.id) : undefined));
  const source = useEditorStore((s) => (piece ? s.sources.find((x) => x.nodeId === piece.sourceNodeId) : undefined));
  // Style is the default tab, and selecting a caption doesn't switch away from it (D413).
  const [tab, setTab] = useState<CaptionsTab>("style");

  return (
    <aside aria-label="Inspector" data-keep-selection="" className="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-[14px] border border-border bg-card px-4 pb-4 pt-2">
      <EditorPanelHeader label="Inspector" side="right" shortcut="Ctrl 2" onCollapse={onCollapse} />
      {piece && source ? <EditorClipInspector piece={piece} source={source} /> : <EditorCaptionsPanel tab={tab} onTab={setTab} />}
    </aside>
  );
}
