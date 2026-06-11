"use client";

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
          <button
            key={s.key}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(s.key)}
            className={cn(
              "nodrag rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
