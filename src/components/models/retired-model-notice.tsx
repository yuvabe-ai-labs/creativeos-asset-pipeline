"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MODEL_RETIRED_MESSAGE } from "@/lib/ai-models/runnable";
import { cn } from "@/lib/utils";

/** D544 — shown in a focus view whose node was moved off a retired model when the canvas opened. */
export function RetiredModelNotice({
  retiredModelId,
  onDismiss,
  className,
}: {
  retiredModelId: string | undefined;
  onDismiss: () => void;
  className?: string;
}) {
  if (!retiredModelId) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-muted/40 py-1 pl-3 pr-1 text-sm text-foreground",
        className,
      )}
    >
      <p className="flex-1">{MODEL_RETIRED_MESSAGE}</p>
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onDismiss}>
        <X strokeWidth={1.5} />
      </Button>
    </div>
  );
}
