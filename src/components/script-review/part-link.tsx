// src/components/script-review/part-link.tsx
"use client";

import { Button } from "@/components/ui/button";
import { partAnchor } from "@/lib/script-review/anchors";
import type { Part } from "@/lib/script-review/types";

/** A part's name that jumps to it on the page ("S1 revised" jumps to S1, spec 4 §7). */
export function PartLink({ part, label }: { part: Part; label: string }) {
  return (
    <Button
      variant="link"
      className="h-auto self-start p-0 text-sm font-medium"
      onClick={() => document.getElementById(partAnchor(part))?.scrollIntoView({ behavior: "smooth", block: "center" })}
    >
      {label}
    </Button>
  );
}
