"use client";

import { cn } from "@/lib/utils";

// Renders a comma-separated list of brand colours (e.g. "turmeric gold #C8A000,
// soft green #3D6B1A") as labelled swatches. Each entry shows a colour chip when
// a hex code is present; entries without one fall back to plain text. Reusable
// across any colour-palette field.

const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/;

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
        const hex = entry.match(HEX)?.[0];
        return (
          <span key={i} className="inline-flex items-center gap-1.5">
            {hex && (
              <span
                aria-hidden
                className="size-4 shrink-0 rounded border border-black/10 shadow-sm dark:border-white/15"
                style={{ backgroundColor: hex }}
              />
            )}
            <span>{entry}</span>
          </span>
        );
      })}
    </span>
  );
}
