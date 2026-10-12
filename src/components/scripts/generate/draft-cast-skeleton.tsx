import { Skeleton } from "@/components/ui/skeleton";

/** The cast list before the first draft names anyone: the same section, two placeholder people. */
export function DraftCastSkeleton() {
  return (
    <section aria-hidden className="flex flex-col gap-3">
      <h2 className="text-eyebrow">Cast</h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {[0, 1].map((i) => (
          <li key={i} className="flex gap-3 rounded-xl border border-border bg-card p-3">
            <Skeleton className="size-14 shrink-0 rounded-lg" />
            <span className="flex flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-4/5" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
