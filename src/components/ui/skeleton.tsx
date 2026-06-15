import { cn } from "@/lib/utils";

/**
 * Skeleton — the single shimmer placeholder primitive. A neutral rounded block
 * with a sweeping highlight driven by the existing `animate-shimmer` keyframe
 * (globals.css). Neutral-only by design: no brand purple. Server-safe.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("relative overflow-hidden rounded-md bg-muted", className)}
      {...props}
    >
      <div
        aria-hidden
        className="animate-shimmer absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/55 to-transparent"
      />
    </div>
  );
}

export { Skeleton };
