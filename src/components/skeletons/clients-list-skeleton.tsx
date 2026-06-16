import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/skeletons/list-skeleton";

export function ClientsListSkeleton() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <Skeleton className="h-3 w-40" />
          <h1 className="mt-2 font-display text-5xl font-semibold tracking-[-0.02em] text-muted-foreground/60">
            Loading clients…
          </h1>
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </header>

      <ListSkeleton withAvatar />
    </main>
  );
}
