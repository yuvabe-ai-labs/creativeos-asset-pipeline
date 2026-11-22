"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useAiCatalog } from "@/hooks/queries/ai-models";

// The credit cost shown on a generate control — the same number the route will reserve.
// D534 — while the prices load it shows a spinner; with no priced estimate it shows nothing.
export function AvatarCreditCost({ credits }: { credits: number | null }) {
  const catalog = useAiCatalog();
  if (credits === null) {
    return catalog.isPending ? (
      <Loader2 role="status" aria-label="Working out the cost" className="size-3 animate-spin opacity-85" strokeWidth={1.5} />
    ) : null;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-normal opacity-85 tabular-nums">
      <Sparkles className="size-3" strokeWidth={1.5} />
      {credits.toLocaleString()}
    </span>
  );
}
