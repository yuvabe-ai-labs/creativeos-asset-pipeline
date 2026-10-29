"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { unsureWordIndexes } from "@/lib/editor/auto-captions";
import { addCaption, captionTimes } from "@/lib/editor/captions";
import { formatTime, pieceOffsets } from "@/lib/editor/timeline";
import { useAutoCaptionsContext } from "./auto-captions-context";
import { EditorAutoCaptionsButton } from "./editor-auto-captions-button";
import { EditorCaptionLine } from "./editor-caption-line";
import { EditorCaptionsMoreMenu } from "./editor-captions-more-menu";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";

/** The Text tab (spec §9): every line with its start, grouped by clip, as in VEED's list. */
export function EditorCaptionsText() {
  const doc = useEditorStore((s) => s.doc);
  const sources = useEditorStore((s) => s.sources);
  const selection = useEditorStore((s) => s.selection);
  const select = useEditorStore((s) => s.select);
  const apply = useEditorStore((s) => s.apply);
  const editable = useEditorStore((s) => s.editable);
  const { time, seek } = usePlayback();
  const { listening, failed, transcripts } = useAutoCaptionsContext();
  const selectedId = selection?.kind === "caption" ? selection.id : null;

  useEffect(() => {
    if (selectedId) document.querySelector(`[data-caption-row="${selectedId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  if (doc.captions.length === 0 && listening.size === 0 && failed.size === 0) {
    const addHere = () => {
      const id = crypto.randomUUID();
      apply((d) => addCaption(d, time, id));
      select({ kind: "caption", id });
    };
    return (
      <div className="flex flex-col items-start gap-2.5">
        <p className="m-0 text-xs text-muted-foreground">Write captions from what&apos;s said in every clip, timed to each word. You can fix any word after.</p>
        <EditorAutoCaptionsButton size="default" />
        <Button variant="link" size="sm" className="h-auto p-0" disabled={!editable || doc.pieces.length === 0} onClick={addHere}>
          Or add one by hand
        </Button>
      </div>
    );
  }

  const offsets = pieceOffsets(doc.pieces);
  const showing = doc.captions.find((c) => {
    const t = captionTimes(doc, c);
    return t && time >= t.start && time < t.end;
  });

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs text-muted-foreground">Click a line to fix its words.</span>
        <EditorCaptionsMoreMenu />
      </div>
      {doc.pieces.map((p, i) => {
        const lines = doc.captions.filter((c) => c.pieceId === p.id).sort((a, b) => a.at - b.at);
        const handle = sources.find((s) => s.nodeId === p.sourceNodeId)?.handle ?? "Missing clip";
        const state = listening.has(p.id) ? "Listening…" : failed.has(p.id) ? "Not captioned" : `${lines.length} line${lines.length === 1 ? "" : "s"}`;
        return (
          <div key={p.id} className="flex flex-col gap-0.5">
            <div className="flex justify-between gap-2 px-2 pb-0.5 pt-2.5">
              <span className="truncate text-eyebrow text-muted-foreground">
                {i + 1}. {handle}
              </span>
              <span className="flex-none text-[11px] text-muted-foreground">{state}</span>
            </div>
            {lines.map((c) => {
              const t = captionTimes(doc, c);
              return (
                <EditorCaptionLine
                  key={c.id}
                  caption={c}
                  start={formatTime(t ? t.start : offsets[i])}
                  selected={c.id === selectedId}
                  playing={c.id === showing?.id}
                  unsure={unsureWordIndexes(c, c.from ? transcripts?.get(c.from) : undefined)}
                  onSelect={() => {
                    select({ kind: "caption", id: c.id });
                    if (t) seek(t.start + 0.001);
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
