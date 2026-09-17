import { Skeleton } from "@/components/ui/skeleton";
import { MarketGridSkeleton } from "./market-grid-skeleton";

/** Route-level placeholder for /clients/[id]/market — same shell as the live page
 *  (breadcrumb, header, tab strip, shelf) so nothing jumps when it resolves. */
export function MarketPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <Skeleton className="h-4 w-60" />

      <header className="mb-6 mt-4 space-y-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Market</h1>
        <Skeleton className="h-4 w-[32rem] max-w-full" />
      </header>

      <Skeleton className="h-9 w-80 max-w-full rounded-lg" />

      <div className="flex flex-col gap-3 pt-4">
        <Skeleton className="h-4 w-72 max-w-full" />
        <MarketGridSkeleton />
      </div>
    </main>
  );
}
