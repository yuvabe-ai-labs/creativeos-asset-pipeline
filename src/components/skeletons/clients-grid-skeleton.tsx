import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function ClientsGridSkeleton() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 h-12 w-48" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i}>
            <Card className="gap-0 overflow-hidden p-0">
              <div className="flex h-28 items-center justify-center border-b bg-muted/40 p-5">
                <Skeleton className="h-10 w-28" />
              </div>
              <div className="space-y-2 px-4 py-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
