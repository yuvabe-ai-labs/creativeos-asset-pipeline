"use client";

import { cn } from "@/lib/utils";
import { parseColour } from "@/lib/kb/utils";

// Renders a comma-separated list of brand colours (e.g. "turmeric gold #C8A000,
// soft green #3D6B1A") as labelled swatches: a colour chip, the name, and the hex code
// (always #RRGGBB). An entry with no hex falls back to its name alone. Reusable across
// any colour-palette field.

export function KBColorSwatches({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const entries = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (entries.length === 0) return null;

  return (
    <span className={cn("flex flex-wrap gap-x-3 gap-y-1.5", className)}>
      {entries.map((entry, i) => {
        const { name, hex } = parseColour(entry);
        return (
          <span key={i} className="inline-flex items-center gap-1.5">
            {hex && (
              <span
                aria-hidden
                className="size-4 shrink-0 rounded border border-black/10 shadow-sm dark:border-white/15"
                style={{ backgroundColor: hex }}
              />
            )}
            {name && <span>{name}</span>}
            {hex && <span className="text-muted-foreground tabular-nums">{hex}</span>}
          </span>
        );
      })}
    </span>
  );
}
