"use client";

import { Fragment } from "react";
import { unsureWordIndexes } from "@/lib/editor/auto-captions";
import { captionTimes } from "@/lib/editor/captions";
import { formatTime } from "@/lib/editor/timeline";
import type { Piece } from "@/lib/editor/types";
import { useAutoCaptionsContext } from "./auto-captions-context";
import { EditorAutoCaptionsButton } from "./editor-auto-captions-button";
import { EditorCaptionLine } from "./editor-caption-line";
import { EditorCaptionsStyle } from "./editor-captions-style";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

/** A selected clip's captions (D405): its lines, and captioning it again. The selected caption
 *  (picked here, on the preview or on the Captions lane) opens its own style right under its line;
 *  those changes reach that caption only (D505). */
export function EditorClipCaptionsTab({ piece }: { piece: Piece }) {
  const doc = useEditorStore((s) => s.doc);
  const pickedId = useEditorStore((s) => (s.selection?.kind === "caption" ? s.selection.id : null));
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
        <p className="m-0 text-xs text-muted-foreground">Click a line to jump to it and style it on its own; click its words to fix them.</p>
      )}
      <div className="flex flex-col gap-0.5">
        {lines.map((c) => {
          const t = captionTimes(doc, c);
          const picked = c.id === pickedId;
          return (
            <Fragment key={c.id}>
              <EditorCaptionLine
                caption={c}
                start={formatTime(t?.start ?? 0)}
                selected={picked}
                playing={!!t && time >= t.start && time < t.end}
                unsure={unsureWordIndexes(c, c.from ? transcripts?.get(c.from) : undefined)}
                onSelect={() => {
                  if (t) seek(t.start + 0.001);
                  select({ kind: "caption", id: c.id });
                }}
              />
              {picked && (
                <section
                  aria-label="Style for this caption"
                  className="mb-2 ml-2 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-card"
                >
                  <h4 className="m-0 text-[13px] font-semibold">Style for this caption</h4>
                  <EditorCaptionsStyle captionId={c.id} />
                </section>
              )}
            </Fragment>
          );
        })}
      </div>
      <div className="border-t border-border pt-3">
        <EditorAutoCaptionsButton pieceIds={[piece.id]} label={lines.length ? "Redo captions for this clip" : "Caption this clip"} />
      </div>
    </div>
  );
}
