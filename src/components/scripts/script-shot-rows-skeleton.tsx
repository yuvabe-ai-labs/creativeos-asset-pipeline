import { Skeleton } from "@/components/ui/skeleton";
import { SHOT_GRID } from "./script-shot-row";

/** Shot rows still to come, in the shot table's own grid: the first draft streaming in (D366). */
export function ScriptShotRowsSkeleton({ count, className = "" }: { count: number; className?: string }) {
  return (
    <ul aria-hidden className={className}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={`grid gap-3 border-b border-border px-4 py-3 last:border-b-0 ${SHOT_GRID}`}>
          <span className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-6" />
            <Skeleton className="h-3 w-12" />
          </span>
          <span className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className={`h-3.5 ${i % 2 ? "w-3/5" : "w-4/5"}`} />
          </span>
          <span className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className={`h-3.5 ${i % 2 ? "w-4/5" : "w-1/2"}`} />
          </span>
          <Skeleton className={`hidden h-3.5 md:block ${i % 2 ? "w-1/2" : "w-3/4"}`} />
          <Skeleton className="hidden h-3 w-16 md:block" />
        </li>
      ))}
    </ul>
  );
}
