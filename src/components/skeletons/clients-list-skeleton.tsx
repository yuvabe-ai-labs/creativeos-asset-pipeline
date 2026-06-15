import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/skeletons/list-skeleton";

export function ClientsListSkeleton() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
      <header className="mb-10 flex items-end justify-between">
        <div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 h-12 w-48" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </header>

      <ListSkeleton withAvatar />
    </main>
  );
}
