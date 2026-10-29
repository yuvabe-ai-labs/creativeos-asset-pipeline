"use client";

import { unsureWordIndexes } from "@/lib/editor/auto-captions";
import { captionTimes } from "@/lib/editor/captions";
import { formatTime } from "@/lib/editor/timeline";
import type { Piece } from "@/lib/editor/types";
import { useAutoCaptionsContext } from "./auto-captions-context";
import { EditorAutoCaptionsButton } from "./editor-auto-captions-button";
import { EditorCaptionLine } from "./editor-caption-line";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

/** A selected clip's captions (D405): its lines, and captioning it again. */
export function EditorClipCaptionsTab({ piece }: { piece: Piece }) {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const { time, seek } = usePlayback();
  const { transcripts, listening } = useAutoCaptionsContext();
  const lines = doc.captions.filter((c) => c.pieceId === piece.id).sort((a, b) => a.at - b.at);

  return (
    <div className="flex flex-col gap-2">
      {listening.has(piece.id) ? (
        <p className="m-0 text-xs text-muted-foreground">Listening…</p>
      ) : lines.length === 0 ? (
        <p className="m-0 text-xs text-muted-foreground">No captions on this clip yet.</p>
      ) : (
        <p className="m-0 text-xs text-muted-foreground">Click a line to jump to it; click its words to fix them.</p>
      )}
      <div className="flex flex-col gap-0.5">
        {lines.map((c) => {
          const t = captionTimes(doc, c);
          return (
            <EditorCaptionLine
              key={c.id}
              caption={c}
              start={formatTime(t?.start ?? 0)}
              selected={selection?.kind === "caption" && selection.id === c.id}
              playing={!!t && time >= t.start && time < t.end}
              unsure={unsureWordIndexes(c, c.from ? transcripts?.get(c.from) : undefined)}
              onSelect={() => {
                if (t) seek(t.start + 0.001);
                select({ kind: "piece", id: piece.id });
              }}
            />
          );
        })}
      </div>
      <div className="border-t border-border pt-3">
        <EditorAutoCaptionsButton pieceIds={[piece.id]} label={lines.length ? "Redo captions for this clip" : "Caption this clip"} />
      </div>
    </div>
  );
}
