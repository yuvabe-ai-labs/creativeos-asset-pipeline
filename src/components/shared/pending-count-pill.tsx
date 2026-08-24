import { cn } from "@/lib/utils";

// D154/R5.8: a NEUTRAL pill carrying a single amber dot.
//
// Red is deliberately unreachable from this component (R5.9). `changes_requested` owns the
// destructive token on ApprovalBadge; a red dot meaning "needs review" at the client level,
// resolving to a red badge meaning "was rejected" at the node level, would give one colour
// two meanings inside the single journey R5.7 describes.
//
// R5.10: the treatment stays quiet on purpose. A page where every row carries a count must
// still read as a list, not an alarm — which is why the pill itself is neutral and only the
// 6px dot is coloured.
const SCOPE_LABEL: Record<string, string> = {
  client: "awaiting review across this client's canvases",
  canvas: "awaiting review on this canvas",
  org: "awaiting review across your organization",
};

export function PendingCountPill({
  count,
  scope,
  className,
}: {
  count: number;
  scope: "client" | "canvas" | "org";
  className?: string;
}) {
  // R5.1: zero renders NOTHING — no empty badge, no muted "0". A resolved row should look
  // resolved, and an unwired call site degrades to showing nothing rather than a wrong
  // number.
  if (count <= 0) return null;

  return (
    <span
      // R9.8: each surface states its own scope, so a navbar reading of 12 beside a canvas
      // reading of 5 is obviously two questions answered rather than a bug.
      title={`${count} ${SCOPE_LABEL[scope]}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5",
        "text-xs font-semibold tabular-nums text-muted-foreground",
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
      {count}
    </span>
  );
}
