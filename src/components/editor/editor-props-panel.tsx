"use client";

import { useState } from "react";
import { EditorCaptionsPanel, type CaptionsTab } from "./editor-captions-panel";
import { EditorClipInspector } from "./editor-clip-inspector";
import { EditorPanelCollapse } from "./editor-panel-rail";
import { useEditorStore } from "./editor-store-provider";

/** The Inspector (D405): a selected clip's tabs, otherwise the Captions panel. Selecting a caption
 *  opens the Captions panel on Text. */
export function EditorPropsPanel({ onCollapse }: { onCollapse(): void }) {
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
    <aside aria-label="Inspector" className="flex min-h-0 flex-col overflow-y-auto rounded-[14px] border border-border bg-card px-4 pb-4 pt-2">
      <div className="-mr-2 flex flex-none items-center justify-between">
        <span className="text-eyebrow text-muted-foreground">Inspector</span>
        <EditorPanelCollapse label="Inspector" side="right" shortcut="Ctrl 2" onCollapse={onCollapse} />
      </div>
      {piece && source ? <EditorClipInspector piece={piece} source={source} /> : <EditorCaptionsPanel tab={tab} onTab={setTab} />}
    </aside>
  );
}
