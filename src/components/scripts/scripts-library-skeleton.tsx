import { Skeleton } from "@/components/ui/skeleton";
import { SCRIPT_STAGES } from "@/lib/scripts/constants";

/** Route-level placeholder for /clients/[id]/scripts: the same shell as the live page
 *  (breadcrumb, header, stage filter chips, card grid) so nothing jumps when it resolves.
 *  Without it the route inherited the client's canvases skeleton; it now lives beside its page in scripts/(library). */
export function ScriptsLibrarySkeleton() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <Skeleton className="h-4 w-56" />

      <section className="mt-4 flex flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <h1 className="font-display text-3xl font-medium text-muted-foreground/60">Scripts</h1>
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-10 w-32 rounded-md" />
        </header>

        {/* "All" plus one chip per stage, as scripts-library.tsx renders them. */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: SCRIPT_STAGES.length + 1 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <div className="border-t pt-3">
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
