"use client";

import { Lock } from "lucide-react";
import { useGenerationLock } from "@/hooks/use-generation-lock";
import { GENERATION_LOCK_COPY } from "@/lib/editor/generation-lock";

/** D390 — the card's lock row (canvas mockup): why this clip can't generate while it is in the
 *  Editor's reel. Renders nothing for a free node. O(1): reads the canvas's lock index. */
export function GenerationLockLine({ nodeId }: { nodeId: string }) {
  const lock = useGenerationLock(nodeId);
  if (!lock) return null;
  const [lead, ...rest] = GENERATION_LOCK_COPY[lock].short.split(" · ");
  return (
    <div className="flex items-center gap-2 border-t border-border px-3 py-2.5 text-xs">
      <Lock className="size-3.5 shrink-0 text-primary" strokeWidth={1.5} aria-hidden="true" />
      <span className="font-medium text-foreground">{lead}</span>
      {rest.length > 0 && <span className="text-muted-foreground">· {rest.join(" · ")}</span>}
    </div>
  );
}
