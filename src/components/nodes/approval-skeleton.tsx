// Placeholder for the approval control while a node's versions are still loading.
//
// Geometry matches InlineApprovalBar's resting state — label row on top, action row
// below — so the section does not resize when the real control replaces it. The
// alternative it replaced was worse than a blank: the view rendered "Generate a video
// first to review and approve it", a confident wrong answer, and then snapped to the
// approval buttons a moment later.
export function ApprovalSkeleton() {
  return (
    <div className="min-w-0" aria-hidden>
      <div className="flex items-center justify-between gap-2">
        <div className="h-2.5 w-16 animate-pulse rounded bg-muted-foreground/15" />
        <div className="h-2.5 w-20 animate-pulse rounded bg-muted-foreground/10" />
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <div className="h-6 w-24 animate-pulse rounded-md bg-muted-foreground/15" />
        <div className="h-6 w-32 animate-pulse rounded-md bg-muted-foreground/10" />
      </div>
    </div>
  );
}
