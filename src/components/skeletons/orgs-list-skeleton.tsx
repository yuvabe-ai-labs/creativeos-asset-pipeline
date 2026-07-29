import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/skeletons/list-skeleton";

// Mirrors the Agencies page's real layout (src/app/admin/page.tsx) — max-w-3xl, a plain
// 2xl header (not the clients page's oversized 5xl one), a trailing button-sized skeleton
// standing in for the "+ New agency" trigger.
export function OrgsListSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
      <div className="mb-8 flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      <ListSkeleton withAvatar />
    </main>
  );
}
