import { cn } from "@/lib/utils";

// Skeleton rows matching the real row's geometry — thumb, title line, meta line — so the
// list does not jump when content replaces it. A centred "Loading…" string (what this
// replaced) reflows the whole panel the moment data lands, which is the jolt that makes a
// fast load feel slow.
export function ReviewListSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-2 py-2"
        >
          <div className="size-9 shrink-0 animate-pulse rounded-md bg-muted-foreground/15" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div
              className="h-2.5 animate-pulse rounded bg-muted-foreground/15"
              // Staggered widths so the stack reads as content rather than as a barcode.
              style={{ width: `${68 - i * 6}%` }}
            />
            <div
              className="h-2 animate-pulse rounded bg-muted-foreground/10"
              style={{ width: `${44 - i * 4}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
