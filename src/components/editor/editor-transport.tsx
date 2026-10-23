"use client";

import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/editor/timeline";
import { usePlayback } from "./editor-playback-context";

/** Play/pause and the time, under the stage (mockup). */
export function EditorTransport() {
  const { playing, play, pause, time, total } = usePlayback();
  return (
    <div className="flex flex-none items-center gap-3">
      <Button
        variant="outline"
        size="icon"
        aria-label={playing ? "Pause" : "Play"}
        onClick={playing ? pause : play}
        disabled={total === 0}
        className="size-9 rounded-full bg-card"
      >
        {playing ? <Pause className="size-3.5" strokeWidth={1.5} /> : <Play className="size-3.5" strokeWidth={1.5} />}
      </Button>
      <span className="text-sm tabular-nums text-foreground/80">
        {formatTime(time)} <span className="text-muted-foreground">/ {formatTime(total)}</span>
      </span>
    </div>
  );
}
