"use client";

import { captionTimes, retimeCaption } from "@/lib/editor/captions";
import { pieceLimit } from "@/lib/editor/reconcile";
import { totalSeconds } from "@/lib/editor/timeline";
import { EditorCaptionBlock } from "./editor-caption-block";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

/** The Captions lane: each caption where its piece puts it, snapped to the sequence's frames. */
export function EditorCaptionLane({ scale }: { scale: number }) {
  const doc = useEditorStore((s) => s.doc);
  const sources = useEditorStore((s) => s.sources);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const apply = useEditorStore((s) => s.apply);
  const editable = useEditorStore((s) => s.editable);
  const { seek } = usePlayback();

  const first = doc.pieces[0];
  const firstSource = first && sources.find((s) => s.nodeId === first.sourceNodeId);
  const fps = (first && firstSource && pieceLimit(first, firstSource)?.fps) ?? 24;
  const total = totalSeconds(doc.pieces);

  return (
    <>
      {doc.captions.map((c) => {
        const t = captionTimes(doc, c);
        if (!t || t.end <= t.start) return null;
        return (
          <EditorCaptionBlock
            key={c.id}
            text={c.text}
            start={t.start}
            end={t.end}
            scale={scale}
            fps={fps}
            total={total}
            editable={editable}
            selected={selection?.kind === "caption" && selection.id === c.id}
            onChange={(start, end) => apply((d) => retimeCaption(d, c.id, start, end))}
            onSelect={() => {
              select({ kind: "caption", id: c.id });
              seek(t.start);
            }}
          />
        );
      })}
    </>
  );
}
