"use client";

import { Aperture, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FieldLabel } from "./field-label";
import {
  LENS_TILES,
  LENS_AUTO,
  LENS_PREVIEW_SRC,
  lensZoom,
  lensTileLabel,
  lensCaption,
} from "@/lib/nodes/lens-preview";

// Visual "show-don't-tell" renderer for the Lens shot control: one demo photo cropped
// progressively tighter across five focal-length tiles, with Auto pulled out into a header chip.
// Renderer-only — same value/onChange contract as the other shot controls, so compilePrompt output
// is unchanged. Spec: docs/superpowers/specs/2026-07-21-visual-lens-selector-design.md.
export function LensSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const autoActive = value === "auto";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldLabel icon={Aperture} label="Lens" />
        <Button
          variant="outline"
          size="sm"
          aria-pressed={autoActive}
          onClick={() => onChange("auto")}
          className={cn(
            "nodrag",
            autoActive &&
              "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary",
          )}
        >
          <Sparkles className="size-3.5" strokeWidth={1.5} />
          {LENS_AUTO.label}
        </Button>
      </div>

      <div className="flex gap-1.5">
        {LENS_TILES.map((opt) => {
          const active = opt.value === value;
          return (
            <Button
              key={opt.value}
              variant="outline"
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                "nodrag h-auto flex-1 flex-col gap-1 p-1",
                active && "border-primary/50 bg-primary/5",
              )}
            >
              <span className="relative block aspect-square w-full overflow-hidden rounded-[6px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={LENS_PREVIEW_SRC}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 block h-full w-full object-cover object-center"
                  style={{ transform: `scale(${lensZoom(opt.value)})` }}
                />
              </span>
              <span
                className={cn(
                  "text-[11px] leading-none",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {lensTileLabel(opt.value)}
              </span>
            </Button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">{lensCaption(value)}</p>
    </div>
  );
}
