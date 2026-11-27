import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Placeholders shaped like the Usage page (D597) while a period loads: the four tiles, or the chart
// and the breakdown cards. The page's loading state uses both, with the side column.
export function UsageSkeleton({ part }: { part: "tiles" | "main" }) {
  if (part === "tiles") {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="gap-2 p-5 shadow-card">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-32" />
          </Card>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Card className="gap-3 p-5 shadow-card">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-48 w-full" />
      </Card>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="gap-3 p-5 shadow-card">
            <Skeleton className="h-5 w-32" />
            {[0, 1, 2].map((j) => <Skeleton key={j} className="h-10 w-full" />)}
          </Card>
        ))}
      </div>
    </div>
  );
}
