"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "./editor-store-provider";
import { usePlayback } from "./editor-playback-context";
import { EditorStageCaptions } from "./editor-stage-captions";
import { EditorTransport } from "./editor-transport";

/** The preview (mockup "Stage"): shaped like the reel, 9:16 or 16:9. A clip of the other shape
 *  fits inside the frame rather than being cropped. `overlay` is the selected caption's handle. */
export function EditorStage({ overlay, overlayCaptionId }: { overlay?: ReactNode; overlayCaptionId?: string | null }) {
  const shape = useEditorStore((s) => s.doc.shape);
  const empty = useEditorStore((s) => s.doc.pieces.length === 0);
  const { videoRef, audioRef } = usePlayback();
  const portrait = shape === "9:16";

  return (
    <section aria-label="Stage" className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-3.5 rounded-[14px] bg-muted p-[18px]">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div
          aria-label={`Reel preview, ${shape}`}
          className={cn(
            "relative overflow-hidden rounded-2xl bg-black shadow-md [container-type:size]",
            portrait ? "aspect-[9/16] h-full max-w-full" : "aspect-video max-h-full w-full",
          )}
        >
          <video ref={videoRef} playsInline preload="auto" className="absolute inset-0 size-full object-contain" />
          <audio ref={audioRef} preload="auto" className="hidden" />
          {empty && (
            <div className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-white/60">
              Connect clips to the Editor on the canvas, then add them from Sources.
            </div>
          )}
          <EditorStageCaptions skipId={overlayCaptionId} />
          {overlay}
        </div>
      </div>
      <EditorTransport />
    </section>
  );
}
