"use client";

import type { ReactNode } from "react";
import { useEditorStore } from "./editor-store-provider";
import { EditorPieceProps } from "./editor-piece-props";

/** The properties of the current selection (spec §6). Caption props arrive through `caption`. */
export function EditorPropsPanel({ caption }: { caption?: (captionId: string) => ReactNode }) {
  const selection = useEditorStore((s) => s.selection);
  const piece = useEditorStore((s) => (s.selection?.kind === "piece" ? s.doc.pieces.find((p) => p.id === s.selection!.id) : undefined));
  const source = useEditorStore((s) => (piece ? s.sources.find((x) => x.nodeId === piece.sourceNodeId) : undefined));

  return (
    <aside aria-label="Properties" className="flex min-h-0 flex-col gap-[18px] overflow-y-auto rounded-[14px] border border-border bg-card p-[18px]">
      {piece && source ? (
        <EditorPieceProps piece={piece} source={source} />
      ) : selection?.kind === "caption" && caption ? (
        caption(selection.id)
      ) : (
        <>
          <span className="text-eyebrow text-muted-foreground">Properties</span>
          <p className="m-0 text-sm text-muted-foreground">Select a clip or a caption on the timeline to see its properties.</p>
        </>
      )}
    </aside>
  );
}
