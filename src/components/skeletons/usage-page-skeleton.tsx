import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UsageSkeleton } from "@/components/billing/owner/usage/usage-skeleton";
import { USAGE_PAGE_CLASS } from "@/lib/billing/constants";

// Mirrors the owner's Usage page (src/app/billing/page.tsx): the title and period, the four tiles,
// the chart and breakdowns, and the side column's cards.
export function UsagePageSkeleton() {
  return (
    <main className={USAGE_PAGE_CLASS}>
      <div className="flex flex-col gap-6">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
        <UsageSkeleton part="tiles" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <UsageSkeleton part="main" />
          <div className="flex flex-col gap-4">
            {[0, 1].map((i) => (
              <Card key={i} className="gap-3 p-5 shadow-card">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </Card>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
