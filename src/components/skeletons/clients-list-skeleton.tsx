import { Skeleton } from "@/components/ui/skeleton";

// Mirrors ClientsGrid + ClientTile (and page.tsx's max-w-6xl container) so the swap to
// real content shifts nothing: the search bar, then 4:3 logo plates over a name/meta body
// and the h-10 action row.
export function ClientsListSkeleton() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <Skeleton className="h-3 w-40" />
          <h1 className="mt-2 font-display text-5xl font-semibold tracking-[-0.02em] text-muted-foreground/60">
            Loading clients…
          </h1>
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </header>

      <div className="mb-5">
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className="flex flex-col rounded-xl border bg-card shadow-card">
            <div className="canvas-surface flex aspect-[4/3] items-center justify-center rounded-t-xl border-b">
              <Skeleton className="size-32 rounded-2xl" />
            </div>
            <div className="flex flex-col gap-2 px-4 pt-3.5 pb-3">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="h-10 border-t" />
          </li>
        ))}
      </ul>
    </main>
  );
}
