"use client";

import { Button } from "@/components/ui/button";
import { addCaption, captionTimes, retimeCaption } from "@/lib/editor/captions";
import { displayText } from "@/lib/editor/caption-style";
import { pieceLimit } from "@/lib/editor/reconcile";
import { totalSeconds } from "@/lib/editor/timeline";
import { useAutoCaptionsContext } from "./auto-captions-context";
import { EditorAutoCaptionsButton } from "./editor-auto-captions-button";
import { EditorCaptionBlock } from "./editor-caption-block";
import { EditorCaptionLaneState } from "./editor-caption-lane-state";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

/** The Captions lane: each caption where its piece puts it, snapped to the sequence's frames. Empty,
 *  it offers Auto captions (D399); during a run, each clip says how it's going. */
export function EditorCaptionLane({ scale }: { scale: number }) {
  const doc = useEditorStore((s) => s.doc);
  const sources = useEditorStore((s) => s.sources);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const apply = useEditorStore((s) => s.apply);
  const editable = useEditorStore((s) => s.editable);
  const { time, seek } = usePlayback();
  const { listening, failed } = useAutoCaptionsContext();

  const first = doc.pieces[0];
  const firstSource = first && sources.find((s) => s.nodeId === first.sourceNodeId);
  const fps = (first && firstSource && pieceLimit(first, firstSource)?.fps) ?? 24;
  const total = totalSeconds(doc.pieces);

  if (doc.captions.length === 0 && listening.size === 0 && failed.size === 0) {
    const addHere = () => {
      const id = crypto.randomUUID();
      apply((d) => addCaption(d, time, id));
      select({ kind: "caption", id });
    };
    return (
      <div className="absolute inset-0 flex items-center gap-2.5 pl-1">
        <EditorAutoCaptionsButton className="h-6" />
        <span className="truncate text-xs text-muted-foreground">
          Captions every clip from what&apos;s said, word by word. Or{" "}
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={!editable || doc.pieces.length === 0} onClick={addHere}>
            add one by hand
          </Button>
          .
        </span>
      </div>
    );
  }

  return (
    <>
      {doc.captions.map((c) => {
        const t = captionTimes(doc, c);
        if (!t || t.end <= t.start) return null;
        return (
          <EditorCaptionBlock
            key={c.id}
            text={displayText(c.text, doc.captionStyle)}
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
      <EditorCaptionLaneState scale={scale} />
    </>
  );
}
