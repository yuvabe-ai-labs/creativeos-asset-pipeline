import { Skeleton } from "@/components/ui/skeleton";

/** Route-level placeholder for /clients/[id]/avatars — same shell as the live page
 *  (breadcrumb, header, filter tabs, 8-across grid) so nothing jumps when it resolves. */
export function AvatarsLibrarySkeleton() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <Skeleton className="h-4 w-60" />

      <header className="mb-8 mt-4 flex items-end justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-40" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </header>

      {/* avatars-library.tsx's filter Tabs (All / Generic / Real person), mb-4 below it — without
       *  this row the grid used to sit higher than it does once the real tabs mount. */}
      <Skeleton className="mb-4 h-9 w-64 rounded-lg" />

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    </main>
  );
}
