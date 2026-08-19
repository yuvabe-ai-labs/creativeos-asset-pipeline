"use client";

import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FieldLabel } from "./field-label";
import type { ShotControlOption } from "@/lib/nodes/shot-controls";

type ShotTileStripProps = {
  icon: LucideIcon;
  label: string;
  tiles: ShotControlOption[];
  value: string;
  onChange: (value: string) => void;
  // Per-control presentation, all driven off the option value:
  tileLabel: (value: string) => string; // terse label under each tile
  tooltip: (value: string) => string; // "when to use this" hint
  caption: (value: string) => string; // full label + descriptor under the strip
  mediaSrc?: (value: string) => string; // the tile image
  /** Renders the tile media instead of an <img> — used by Camera, whose tiles
   *  are animated scenes rather than posters. Takes precedence over mediaSrc. */
  renderMedia?: (value: string) => ReactNode;
  mediaStyle?: (value: string) => CSSProperties | undefined; // e.g. Lens' focal-length zoom
  columns?: number; // set → CSS-grid layout with N columns; unset → single flex row
  placeholderIcon?: LucideIcon; // shown when a tile's mediaSrc is "" (default: the strip's `icon`)
  compact?: boolean; // shorter (16:10) tile media instead of square — denser grids that would scroll
};

// Shared "show-don't-tell" strip for a shot control: an image tile per option cropped/framed to
// teach the choice at a glance, per-tile usage tooltips, and a
// lifted+scaled selected tile. Lens and Composition both render through this — the only difference
// is the tile media (mediaSrc/mediaStyle). Renderer-only: same value/onChange contract as the
// text-pill controls, so compilePrompt output is unchanged.
export function ShotTileStrip({
  icon,
  label,
  tiles,
  value,
  onChange,
  tileLabel,
  tooltip,
  caption,
  mediaSrc,
  renderMedia,
  mediaStyle,
  columns,
  placeholderIcon,
  compact,
}: ShotTileStripProps) {
  const PlaceholderIcon = placeholderIcon ?? icon;
  return (
    // One provider for the row so that, once any tooltip opens, hovering a neighbour opens instantly.
    <TooltipProvider delay={300}>
      <div className="space-y-2">
        <FieldLabel icon={icon} label={label} />

        <div
          className={cn(columns ? "grid gap-1.5" : "flex gap-1.5")}
          style={
            columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined
          }
        >
          {tiles.map((opt) => {
            const active = opt.value === value;
            const src = mediaSrc?.(opt.value) ?? "";
            return (
              <Tooltip key={opt.value}>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      aria-pressed={active}
                      onClick={() => onChange(opt.value)}
                      className={cn(
                        "nodrag h-auto flex-col gap-1 p-1 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        columns ? "w-full" : "flex-1",
                        renderMedia && "cam-tile",
                        active &&
                          "z-10 scale-105 border-primary bg-primary/5 shadow-lg ring-2 ring-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "relative block w-full overflow-hidden rounded-[6px]",
                          compact ? "aspect-[16/10]" : "aspect-square",
                        )}
                      >
                        {renderMedia ? (
                          renderMedia(opt.value)
                        ) : src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={src}
                            alt=""
                            aria-hidden
                            className="absolute inset-0 block h-full w-full object-cover object-center"
                            style={mediaStyle?.(opt.value)}
                          />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center bg-muted">
                            <PlaceholderIcon
                              className="size-5 text-muted-foreground/60"
                              strokeWidth={1.5}
                            />
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          // Consistent padding in both states so selecting doesn't shift the label.
                          "rounded-full px-2 py-0.5 text-[11px] leading-none transition-colors",
                          active
                            ? "bg-primary font-medium text-primary-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {tileLabel(opt.value)}
                      </span>
                    </Button>
                  }
                />
                <TooltipContent>{tooltip(opt.value)}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">{caption(value)}</p>
      </div>
    </TooltipProvider>
  );
}
