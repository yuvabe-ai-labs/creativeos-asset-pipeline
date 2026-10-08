// src/components/script-review/part-marker.tsx
"use client";

import { MessageSquarePlus, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { partKey, partLabel } from "@/lib/script-review/parts";
import type { Part } from "@/lib/script-review/types";
import { useReviewSurface } from "./review-surface-context";

/** Spec 4 §4, §6 (review board, 4.15): a part's marker — its thread count in D310's amber, and the
 *  comment action. Both open the part in the Comments column; threads are never drawn here.
 *  `data-part-commented` lets the part's own card pick up a faint amber edge. Nothing renders for
 *  a part no one may comment on now with nothing said (the team's view; after approval).
 *  `action={false}` keeps only the count, where the part has its own comment box (D359). */
export function PartMarker({ part, label, className, action = true }: { part: Part; label?: string; className?: string; action?: boolean }) {
  const { doc, placed, commentable, onPost, openPart } = useReviewSurface();
  const key = partKey(part);
  const count = placed.byPart.get(key)?.length ?? 0;
  const canComment = action && Boolean(onPost) && commentable.has(key);
  if (count === 0 && !canComment) return null;
  const name = label ?? partLabel(part, doc) ?? "this part";

  return (
    <span className={cn("inline-flex items-center gap-1", className)} data-part-commented={count > 0 ? "" : undefined}>
      {count > 0 && (
        <Button
          variant="ghost"
          size="xs"
          aria-label={`${count} ${count === 1 ? "comment" : "comments"} on ${name}`}
          onClick={() => openPart(part, false)}
          className="h-6 rounded-full bg-client/15 px-2 tabular-nums text-client-text hover:bg-client/25 hover:text-client-text"
        >
          <MessageSquareText strokeWidth={1.5} aria-hidden />
          {count}
        </Button>
      )}
      {canComment && (
        <Button
          variant="outline"
          size="icon-xs"
          aria-label={`Comment on ${name}`}
          onClick={() => openPart(part, true)}
          className="border-dashed border-primary/40 text-primary hover:bg-primary/5"
        >
          <MessageSquarePlus strokeWidth={1.5} />
        </Button>
      )}
    </span>
  );
}
