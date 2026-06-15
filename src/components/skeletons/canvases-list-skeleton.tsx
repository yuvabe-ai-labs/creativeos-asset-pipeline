import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/skeletons/list-skeleton";

export function CanvasesListSkeleton() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <Skeleton className="h-4 w-44" />

      <header className="mb-10 mt-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Skeleton className="size-14 shrink-0 rounded-lg" />
          <Skeleton className="mt-1 h-9 w-56" />
        </div>
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
