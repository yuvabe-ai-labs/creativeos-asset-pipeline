import { Skeleton } from "@/components/ui/skeleton";

// The catalog's shape: title and subtitle, the toolbar, then kinds of cards.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 md:px-6 md:py-14">
      <Skeleton className="mb-2 h-8 w-32" />
      <Skeleton className="mb-1.5 h-4 w-full max-w-2xl" />
      <Skeleton className="mb-6 h-4 w-2/3 max-w-md" />
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-full sm:w-64" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      {[6, 5].map((count, s) => (
        <div key={s} className="mt-7">
          <Skeleton className="mb-3 h-6 w-48" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(218px,1fr))] sm:gap-3">
            {Array.from({ length: count }, (_, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl border bg-card px-3.5 py-3 shadow-card">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="mt-1.5 h-4 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}
