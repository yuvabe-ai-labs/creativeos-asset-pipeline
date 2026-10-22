"use client";

import { Button } from "@/components/ui/button";
import { pieceOffsets, pieceSeconds } from "@/lib/editor/timeline";
import { failureCopy, useAutoCaptionsContext } from "./auto-captions-context";
import { EditorAutoCaptionsButton } from "./editor-auto-captions-button";
import { useEditorStore } from "./editor-store-provider";

/** What each clip's part of the Captions lane says while captions are made (spec §2): listening,
 *  couldn't caption (with Try again), or a new take to caption (D401). */
export function EditorCaptionLaneState({ scale }: { scale: number }) {
  const pieces = useEditorStore((s) => s.doc.pieces);
  const { listening, failed, stale, start } = useAutoCaptionsContext();
  const offsets = pieceOffsets(pieces);
  return (
    <>
      {pieces.map((p, i) => {
        const box = { left: offsets[i] * scale, width: Math.max(6, pieceSeconds(p) * scale - 2) };
        if (listening.has(p.id)) {
          return (
            <div key={p.id} style={box} className="absolute inset-y-0 z-20 grid animate-pulse place-items-center overflow-hidden whitespace-nowrap rounded-md bg-primary/10 text-[11px] text-primary">
              Listening…
            </div>
          );
        }
        const reason = failed.get(p.id);
        if (reason) {
          return (
            <div key={p.id} style={box} className="absolute inset-y-0 z-20 flex items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md bg-destructive/10 px-2 text-[11px] text-destructive">
              {failureCopy(reason)}
              {reason !== "no-sound" && (
                <Button variant="link" size="sm" className="h-auto p-0 text-[11px] text-destructive" onClick={() => start([p.id])}>
                  Try again
                </Button>
              )}
            </div>
          );
        }
        if (stale.includes(p.id)) {
          return (
            <div key={p.id} style={box} className="absolute inset-y-0 z-20 flex items-center justify-center overflow-hidden rounded-md border border-dashed border-primary/40 bg-card">
              <EditorAutoCaptionsButton pieceIds={[p.id]} label="Caption this clip" className="h-6 border-0 px-2 text-[11px]" />
            </div>
          );
        }
        return null;
      })}
    </>
  );
}
