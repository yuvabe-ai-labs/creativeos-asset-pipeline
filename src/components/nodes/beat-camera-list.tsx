"use client";

import { Film } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldLabel } from "./field-label";
import {
  VIDEO_CONTROLS,
  beatControlsFor,
  type BeatControl,
  type VideoControls,
} from "@/lib/nodes/video-controls";
import type { ReelShot } from "@/lib/nodes/reel-script";

const CAMERA_OPTIONS =
  VIDEO_CONTROLS.find((group) => group.key === "camera")?.options ?? [];

/**
 * D201 — a camera per beat, replacing the single global camera a multishot shot cannot use.
 *
 * One camera move describes a single continuous take. A clip holding five cuts has five framings,
 * and the guidance has each beat leading framing, then subject, then camera, then light — so the
 * camera belongs beside its beat, not above all of them.
 *
 * Reuses the same option catalog as the single-shot control, so the prose injected per beat is one
 * vocabulary rather than two that could drift. Deliberately a compact Select rather than the
 * animated tile grid `CameraSelect` uses: nine tiles per beat, five beats deep, would bury the
 * beats themselves.
 */
export function BeatCameraList({
  shots,
  controls,
  onChange,
  disabled = false,
}: {
  shots: ReelShot[];
  controls: VideoControls;
  onChange: (beats: BeatControl[]) => void;
  disabled?: boolean;
}) {
  const beats = beatControlsFor(controls, shots.length);
  if (beats.length === 0) return null;

  function setCamera(index: number, camera: string) {
    onChange(beats.map((beat, i) => (i === index ? { ...beat, camera } : beat)));
  }

  return (
    // min-w-0 so a long beat description can never hold this column open — the row truncates,
    // but only if every ancestor in the flex chain is allowed to shrink.
    <div className="min-w-0 space-y-1.5">
      <FieldLabel icon={Film} label={`Camera per beat (${beats.length})`} />
      <p className="text-xs text-muted-foreground">
        Each beat is one cut. Auto lets the prompt choose that beat's framing.
      </p>

      {/* Scrolls in its own box past a handful of beats, so a long ladder cannot push the
          Generate button off the panel. */}
      <div className="no-scrollbar max-h-56 min-w-0 space-y-1.5 overflow-y-auto pr-1">
        {beats.map((beat, i) => {
          const description = (shots[i]?.description ?? "").trim();
          return (
            <div
              key={i}
              className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5"
            >
              <span className="w-4 shrink-0 text-center text-[0.7rem] font-medium text-muted-foreground">
                {i + 1}
              </span>
              <span
                title={description || undefined}
                className="min-w-0 flex-1 truncate text-xs text-foreground/80"
              >
                {description || <span className="italic text-muted-foreground">No description</span>}
              </span>
              <Select
                value={beat.camera}
                // Base UI can emit null when a selection is cleared; "auto" is this control's
                // no-constraint value, so a cleared beat means the prompt chooses its framing.
                onValueChange={(value) => setCamera(i, value ?? "auto")}
                disabled={disabled}
              >
                <SelectTrigger
                  size="sm"
                  className="nodrag w-28 shrink-0 text-xs"
                  aria-label={`Camera for beat ${i + 1}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMERA_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
