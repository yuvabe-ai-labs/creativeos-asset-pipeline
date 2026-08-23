"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KB_PARSE_SLICES, type KBSliceKey } from "@/lib/kb/parse-context";

type SliceTogglesProps = {
  selected: KBSliceKey[];
  onToggle: (key: KBSliceKey) => void;
  className?: string;
  allowedKeys?: KBSliceKey[];
};

// Brand-context chip row. Catalog-driven from KB_PARSE_SLICES; purple only for
// the active state. Pass allowedKeys to restrict which slices are shown (e.g.
// script nodes should not see image-specific slices).
export function SliceToggles({ selected, onToggle, className, allowedKeys }: SliceTogglesProps) {
  const slices = allowedKeys
    ? KB_PARSE_SLICES.filter((s) => allowedKeys.includes(s.key))
    : KB_PARSE_SLICES;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {slices.map((s) => {
        const active = selected.includes(s.key);
        return (
          <Button
            key={s.key}
            type="button"
            variant="ghost"
            aria-pressed={active}
            onClick={() => onToggle(s.key)}
            className={cn(
              "nodrag h-auto rounded-full px-2.5 py-1 text-xs transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
                : "border-border text-muted-foreground hover:bg-muted hover:text-muted-foreground",
            )}
          >
            {s.label}
          </Button>
        );
      })}
    </div>
  );
}
