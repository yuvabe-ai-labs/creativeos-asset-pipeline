"use client";

import { AlertTriangle, Check, ImageIcon, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type EditReferenceItem = {
  id: string;
  label: string;
  url: string;
  isBase: boolean;
  violation?: string;
};

type Props = {
  items: EditReferenceItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  /** Pin a connected image as the edit base (D39). */
  onSetBase: (id: string) => void;
  /** False when a generated attempt is the base — the base can't be re-pointed at a reference. */
  canSetBase: boolean;
};

// Selectable connected-node tiles. Base is shown but not toggleable (it's the image being
// edited, not an extra). Selected extras are sent to the edit route (spec §7). Non-base tiles
// expose a hover "set as base" pin (D39) so the operator picks the base explicitly instead of
// silently inheriting the first-connected image.
export function ImageGenEditReferences({
  items,
  selectedIds,
  onToggle,
  onSetBase,
  canSetBase,
}: Props) {
  if (items.length === 0) return null;
  return (
    <TooltipProvider>
      <div className="space-y-2">
        <span className="text-eyebrow text-[0.6rem]! text-muted-foreground">
          References for this edit
        </span>
        <div className="flex flex-wrap gap-2">
          {items.map((it) => {
            const selected = it.isBase || selectedIds.includes(it.id);
            const hasViolation = !!it.violation;
            return (
              <div key={it.id} className="group relative size-16">
                <button
                  type="button"
                  disabled={it.isBase}
                  onClick={() => !it.isBase && onToggle(it.id)}
                  className={cn(
                    "nodrag size-full overflow-hidden rounded-lg border transition-colors",
                    hasViolation
                      ? "border-amber-400"
                      : it.isBase
                        ? "border-border opacity-90"
                        : selected
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-dashed border-primary/40 hover:bg-primary/5",
                  )}
                  title={it.isBase ? "Base image (being edited)" : it.label}
                >
                  {it.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.url}
                      alt={it.label}
                      className={cn("size-full object-cover", hasViolation && "opacity-50")}
                    />
                  ) : (
                    <ImageIcon className="m-auto size-5 text-muted-foreground/50" strokeWidth={1.5} />
                  )}
                  {/* amber overlay tint for violation */}
                  {hasViolation && (
                    <span className="absolute inset-0 rounded-lg bg-amber-400/20" />
                  )}
                  {it.isBase ? (
                    <span className="absolute inset-x-0 bottom-0 bg-background/80 py-0.5 text-center text-[0.55rem] font-medium">
                      Base
                    </span>
                  ) : (
                    !hasViolation && selected && (
                      <span className="absolute right-1 top-1 inline-flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-2.5" strokeWidth={3} />
                      </span>
                    )
                  )}
                </button>

                {/* Violation badge — amber triangle, tooltip on hover */}
                {hasViolation && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="absolute right-0.5 top-0.5 inline-flex items-center justify-center rounded-full bg-amber-50 border border-amber-300 p-0.5 shadow-sm" />
                      }
                    >
                      <AlertTriangle className="size-3 text-amber-500" strokeWidth={1.5} />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-56 text-center">
                      <p className="font-medium text-amber-700">Not supported by this model</p>
                      <p className="text-muted-foreground mt-0.5">{it.violation}</p>
                      <p className="text-muted-foreground mt-0.5">Try a different model.</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {!it.isBase && canSetBase && !hasViolation && (
                  <button
                    type="button"
                    onClick={() => onSetBase(it.id)}
                    className={cn(
                      "nodrag absolute left-1 top-1 inline-flex size-5 items-center justify-center",
                      "rounded-full border border-primary/40 bg-background/90 text-primary shadow-card",
                      "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                      "hover:bg-primary hover:text-primary-foreground",
                    )}
                    title="Set as base image"
                    aria-label="Set as base image"
                  >
                    <Pin className="size-3" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
