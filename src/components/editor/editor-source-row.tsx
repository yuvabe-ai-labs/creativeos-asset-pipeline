"use client";

import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSourceFrames } from "@/hooks/use-source-frames";
import { dubLanguageLabel } from "@/lib/dubbing/types";
import { formatTime } from "@/lib/editor/timeline";
import type { SourceView } from "@/lib/editor/types";
import { cn } from "@/lib/utils";

/** One connected source: a frame from it, its handle, length and dub, and a chip to put it on the
 *  timeline again. The frame is read once per file for the page (useSourceFrames). */
export function EditorSourceRow({ source, editable, onAdd }: { source: SourceView; editable: boolean; onAdd(): void }) {
  const video = source.files.original.facts?.video;
  const frames = useSourceFrames(source.files.original.url);
  const thumb = useRef<HTMLCanvasElement>(null);
  const frame = frames[Math.min(2, frames.length - 1)];
  useEffect(() => {
    const c = thumb.current;
    const g = c?.getContext("2d");
    if (c && g && frame) g.drawImage(frame, 0, 0, c.width, c.height);
  }, [frame]);

  const language = source.language ? dubLanguageLabel(source.language) : null;
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border border-border p-1.5">
      <canvas ref={thumb} width={68} height={120} aria-hidden="true" className="h-[52px] w-[30px] flex-none rounded-md bg-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold">{source.handle}</span>
        <span className={cn("flex flex-wrap items-center gap-1 text-[11px]", video ? "text-muted-foreground" : "text-destructive")}>
          {video ? `${source.shotLabel ?? "No shot"} · ${formatTime(video.frames / video.fps)}` : "Couldn't read this clip."}
          {source.files.dubAudio && <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{language ?? "Dub"}</span>}
          {source.files.lipSynced && <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">LIP</span>}
        </span>
      </div>
      <Button
        variant="outline"
        size="icon"
        aria-label={`Add ${source.handle} to the end of the timeline`}
        title="Add to the end of the timeline"
        disabled={!editable || !video}
        onClick={onAdd}
        className="size-7 flex-none border-dashed border-primary/40 text-primary hover:bg-primary/5"
      >
        <Plus className="size-3.5" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
