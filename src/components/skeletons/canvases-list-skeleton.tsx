import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/skeletons/list-skeleton";

export function CanvasesListSkeleton() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <Skeleton className="h-4 w-44" />

      <header className="mb-10 mt-4 flex items-center justify-between gap-4">
        <h1 className="font-display text-4xl font-semibold tracking-[-0.02em] text-muted-foreground/60">
          Loading canvases…
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </header>

      <ListSkeleton />
    </main>
  );
}
