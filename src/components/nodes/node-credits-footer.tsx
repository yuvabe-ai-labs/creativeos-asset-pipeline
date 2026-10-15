"use client";

import { Skeleton } from "@/components/ui/skeleton";

// The bottom "N credits spent" strip on a node card. totalCredits === null means the cost
// (useNodeCost) hasn't loaded yet — while loading, only reserve the footer's space with a
// skeleton when the node already has output, since that's the only case a footer is likely
// to appear at all; a never-generated node's cost resolves to 0 and shows no footer, so
// skeletoning it too would just be a flash of nothing where nothing was ever coming.
export function NodeCreditsFooter({
  totalCredits,
  hasOutput,
}: {
  totalCredits: number | null;
  hasOutput: boolean;
}) {
  if (totalCredits === null) {
    if (!hasOutput) return null;
    return (
      <div className="border-t border-border px-3 py-1.5">
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }
  if (totalCredits <= 0) return null;
  return (
    <div className="border-t border-border px-3 py-1.5">
      <p className="text-[0.6rem] tabular-nums text-muted-foreground">
        {totalCredits.toLocaleString()} credits spent
      </p>
    </div>
  );
}
