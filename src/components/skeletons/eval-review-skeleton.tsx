import { Skeleton } from "@/components/ui/skeleton";

export function EvalReviewSkeleton() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-background/60 px-6 py-3 backdrop-blur">
        <span className="font-display text-sm font-medium text-muted-foreground/60">
          Loading eval review…
        </span>
        <Skeleton className="h-8 w-28 rounded-md" />
      </header>

      <div className="flex flex-1 gap-4 p-6">
        <Skeleton className="hidden h-[70vh] w-64 shrink-0 rounded-xl sm:block" />
        <Skeleton className="h-[70vh] flex-1 rounded-xl" />
      </div>
    </main>
  );
}
