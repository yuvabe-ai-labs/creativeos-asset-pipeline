"use client";

import { Eye } from "lucide-react";

/** D433 — beside an output heading while an older version, picked in History, is on screen.
 *  Quiet and one line, so the output below never moves; Back and Restore live in History. */
export function ViewingTag({ label }: { label: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">
      <Eye className="size-3.5" strokeWidth={1.5} />
      {`Showing ${label}`}
    </span>
  );
}
