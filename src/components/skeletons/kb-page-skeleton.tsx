import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function KBPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <Skeleton className="h-4 w-52" />

      <header className="mb-8 mt-4 space-y-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-muted-foreground/60">
          Loading brand KB…
        </h1>
        <Skeleton className="h-4 w-96 max-w-full" />
      </header>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="flex flex-row items-center gap-4 p-4">
            <Skeleton className="size-10 shrink-0 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
